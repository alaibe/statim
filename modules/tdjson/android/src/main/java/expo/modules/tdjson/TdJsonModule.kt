package expo.modules.tdjson

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.drinkless.tdlib.JsonClient
import java.util.concurrent.Executors

class TdJsonModule : Module() {
  private val loaded = runCatching { System.loadLibrary("tdjsonjava") }.isSuccess

  @Volatile private var clientId: Int? = null

  override fun definition() = ModuleDefinition {
    Name("TdJson")

    Function("create") {
      if (!loaded) throw NotBundledException()
      JsonClient.execute("""{"@type":"setLogVerbosityLevel","new_verbosity_level":0}""")
      JsonClient.createClientId().also { clientId = it }
    }

    Function("send") { id: Int, request: String ->
      JsonClient.send(id, request)
    }

    AsyncFunction("receive") { timeout: Double, limit: Int, promise: Promise ->
      receiver.execute {
        val batch = StringBuilder("[")
        var wait = timeout
        for (index in 0 until limit) {
          val event = JsonClient.receive(wait) ?: break
          if (index > 0) batch.append(',')
          batch.append(event)
          wait = 0.0
        }
        promise.resolve(batch.append(']').toString())
      }
    }

    Function("destroy") { id: Int ->
      if (clientId == id) clientId = null
    }

    // A reload starts a new JS runtime against the same database, which TDLib
    // keeps locked until the old client has closed.
    OnDestroy {
      clientId?.let { JsonClient.send(it, """{"@type":"close"}""") }
    }
  }

  companion object {
    // Every AsyncFunction of every module shares one thread and receive blocks,
    // while TDLib allows one receive at a time per process, across reloads too.
    private val receiver = Executors.newSingleThreadExecutor()
  }
}

private class NotBundledException :
  CodedException("TDLib is not part of this build: `scripts/build-tdlib-android.sh` builds it.")
