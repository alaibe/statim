package expo.modules.stayconnected

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

class StayConnectedService : Service() {
  private var task: Pair<HeadlessJsTaskContext, Int>? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "Connection", NotificationManager.IMPORTANCE_MIN)
    )
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(if (icon != 0) icon else applicationInfo.icon)
      .setContentTitle("Connected")
      .setContentText("Messages arrive while Statim is closed.")
      .setContentIntent(open)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
    )
    keepTimersRunning()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    task?.let { (tasks, id) -> if (tasks.isTaskRunning(id)) tasks.finishTask(id) }
    task = null
    super.onDestroy()
  }

  /** React Native pauses JS timers without a screen unless a headless task is running. */
  private fun keepTimersRunning() {
    if (task != null) return
    val react = (application as? ReactApplication)?.reactHost?.currentReactContext ?: return
    val tasks = HeadlessJsTaskContext.getInstance(react)
    task = tasks to tasks.startTask(HeadlessJsTaskConfig(TASK, Arguments.createMap(), 0, true))
  }

  private companion object {
    const val CHANNEL = "connection"
    const val NOTIFICATION_ID = 1
    const val TASK = "StayConnected"
  }
}
