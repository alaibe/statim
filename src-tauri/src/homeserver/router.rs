//! Serves each bridge's login API at `/_matrix/provision/<bridge>/`, as a self-hosted server's proxy would.

use std::convert::Infallible;
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StdListener};
use std::sync::Arc;

use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use hyper_util::rt::{TokioExecutor, TokioIo};
use tauri::async_runtime::JoinHandle;

/// Where requests go: the server's port, and each bridge's port by its name.
pub struct Routes {
    pub server: u16,
    pub bridges: Vec<(&'static str, u16)>,
}

fn route(routes: &Routes, path: &str) -> (u16, String) {
    if let Some(rest) = path.strip_prefix("/_matrix/provision/") {
        let (name, tail) = rest.split_once('/').unwrap_or((rest, ""));
        if let Some((_, port)) = routes.bridges.iter().find(|(bridge, _)| *bridge == name) {
            return (*port, format!("/_matrix/provision/{tail}"));
        }
    }
    (routes.server, path.to_string())
}

pub struct Router(JoinHandle<()>);

impl Router {
    /// Binds before returning, so a port someone else holds fails here, by name.
    pub fn start(port: u16, routes: Routes) -> Result<Self, String> {
        let listener = StdListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
            .map_err(|e| format!("Port {port} on this computer is in use: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let routes = Arc::new(routes);
        let client = Client::builder(TokioExecutor::new()).build(HttpConnector::new());
        Ok(Self(tauri::async_runtime::spawn(async move {
            let Ok(listener) = tokio::net::TcpListener::from_std(listener) else {
                return;
            };
            while let Ok((stream, _)) = listener.accept().await {
                let routes = Arc::clone(&routes);
                let client = client.clone();
                tauri::async_runtime::spawn(async move {
                    let service = service_fn(move |request| forward(client.clone(), Arc::clone(&routes), request));
                    let _ = http1::Builder::new()
                        .serve_connection(TokioIo::new(stream), service)
                        .await;
                });
            }
        })))
    }

    /// Returns once the listener is closed, so the port can be bound again straight away.
    pub async fn stop(self) {
        self.0.abort();
        let _ = self.0.await;
    }
}

async fn forward(
    client: Client<HttpConnector, Incoming>,
    routes: Arc<Routes>,
    mut request: Request<Incoming>,
) -> Result<Response<BoxBody<Bytes, hyper::Error>>, Infallible> {
    let (port, path) = route(&routes, request.uri().path());
    let query = request
        .uri()
        .query()
        .map(|query| format!("?{query}"))
        .unwrap_or_default();
    match format!("http://127.0.0.1:{port}{path}{query}").parse() {
        Ok(uri) => *request.uri_mut() = uri,
        Err(_) => return Ok(failure(StatusCode::BAD_REQUEST)),
    }
    Ok(match client.request(request).await {
        Ok(response) => response.map(BodyExt::boxed),
        Err(_) => failure(StatusCode::BAD_GATEWAY),
    })
}

fn failure(status: StatusCode) -> Response<BoxBody<Bytes, hyper::Error>> {
    let mut response = Response::new(Full::new(Bytes::new()).map_err(|never| match never {}).boxed());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn routes() -> Routes {
        Routes {
            server: 47281,
            bridges: vec![("whatsapp", 47290), ("slack", 47291)],
        }
    }

    #[test]
    fn binds_its_port_again_as_soon_as_it_stops() {
        let port = StdListener::bind((Ipv4Addr::LOCALHOST, 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        tauri::async_runtime::block_on(async {
            for _ in 0..20 {
                Router::start(port, routes()).unwrap().stop().await;
            }
        });
    }

    #[test]
    fn sends_a_bridge_login_request_to_that_bridge_without_its_name() {
        assert_eq!(
            route(&routes(), "/_matrix/provision/slack/v3/login/flows"),
            (47291, "/_matrix/provision/v3/login/flows".into())
        );
    }

    #[test]
    fn sends_everything_else_to_the_server() {
        assert_eq!(
            route(&routes(), "/_matrix/client/unstable/org.matrix.simplified_msc3575/sync"),
            (
                47281,
                "/_matrix/client/unstable/org.matrix.simplified_msc3575/sync".into()
            )
        );
        assert_eq!(
            route(&routes(), "/_matrix/provision/signal/v3/login/flows"),
            (47281, "/_matrix/provision/signal/v3/login/flows".into())
        );
    }
}
