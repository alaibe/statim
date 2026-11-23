//
// Copyright Aliaksei Levin (levlam@telegram.org), Arseny Smirnov (arseny30@gmail.com) 2014-2026
//
// Distributed under the Boost Software License, Version 1.0. (See accompanying
// file LICENSE_1_0.txt or copy at http://www.boost.org/LICENSE_1_0.txt)
//
package org.drinkless.tdlib;

public final class JsonClient {
    static {
        try {
            System.loadLibrary("tdjsonjava");
        } catch (UnsatisfiedLinkError e) {
            e.printStackTrace();
        }
    }

    /** The new instance sends no updates until it gets its first request. */
    public static native int createClientId();

    /** May be called from any thread. */
    public static native void send(int clientId, String request);

    /** Never from two threads at once; null when `timeout` seconds pass with no data. */
    public static native String receive(double timeout);

    /** Only for requests documented "Can be called synchronously"; null for an invalid request. */
    public static native String execute(String request);

    public interface LogMessageHandler {
        /** At verbosity 0 TDLib crashes once this returns; no TDLib method may be called from it. */
        void onLogMessage(int verbosityLevel, String message);
    }

    /** Null removes the handler; no TDLib method may be called from the callback. */
    public static native void setLogMessageHandler(int maxVerbosityLevel, JsonClient.LogMessageHandler logMessageHandler);

    private JsonClient() {
    }
}
