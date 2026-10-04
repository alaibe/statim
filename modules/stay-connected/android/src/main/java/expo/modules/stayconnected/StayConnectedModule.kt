package expo.modules.stayconnected

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StayConnectedModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val prefs
    get() = context.getSharedPreferences("stay-connected", Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("StayConnected")

    Function("isEnabled") { prefs.getBoolean(ENABLED, false) }

    Function("setEnabled") { on: Boolean ->
      prefs.edit().putBoolean(ENABLED, on).apply()
      if (on) start() else stop()
    }

    Function("resume") {
      if (prefs.getBoolean(ENABLED, false)) start()
    }
  }

  private fun start() {
    ContextCompat.startForegroundService(context, Intent(context, StayConnectedService::class.java))
  }

  private fun stop() {
    context.stopService(Intent(context, StayConnectedService::class.java))
  }

  private companion object {
    const val ENABLED = "enabled"
  }
}
