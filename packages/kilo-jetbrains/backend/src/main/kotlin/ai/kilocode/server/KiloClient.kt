package ai.kilocode.server

import ai.kilocode.client.api.DefaultApi
import okhttp3.Call
import okhttp3.OkHttpClient

class KiloClient(private val api: DefaultApi) {
    fun health(): Boolean {
        return api.globalHealth().healthy
    }

    companion object {
        fun create(port: Int, call: Call.Factory): KiloClient {
            val url = "http://127.0.0.1:$port"
            return KiloClient(DefaultApi(url, call))
        }

        fun create(port: Int, http: OkHttpClient): KiloClient {
            return create(port, http)
        }
    }
}
