package expo.modules.ondeviceai

import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentifier
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.concurrent.atomic.AtomicBoolean

class AiError(code: String, message: String) : CodedException(code, message, null)

class OnDeviceAiModule : Module() {
  private val model by lazy { Generation.getClient() }
  private val identifier by lazy { LanguageIdentification.getClient() }
  private val downloading = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("OnDeviceAi")

    AsyncFunction("modelState") Coroutine { ->
      try {
        when (model.checkStatus()) {
          FeatureStatus.AVAILABLE -> "ready"
          FeatureStatus.DOWNLOADING -> "downloading"
          FeatureStatus.DOWNLOADABLE -> {
            startDownload()
            "downloading"
          }
          else -> "unsupported"
        }
      } catch (e: Exception) {
        "unsupported"
      }
    }

    AsyncFunction("complete") Coroutine { instructions: String, prompt: String, maxTokens: Int ->
      complete(instructions, prompt, maxTokens)
    }

    AsyncFunction("translate") Coroutine { text: String, target: String ->
      translate(text, target)
    }

    OnDestroy {
      model.close()
      identifier.close()
    }
  }

  private fun startDownload() {
    if (!downloading.compareAndSet(false, true)) return
    appContext.backgroundCoroutineScope.launch {
      try {
        model.download().collect {}
      } catch (e: Exception) {
        // The next modelState call asks again.
      } finally {
        downloading.set(false)
      }
    }
  }

  private suspend fun complete(instructions: String, prompt: String, maxTokens: Int): String {
    val request = generateContentRequest(TextPart("$instructions\n\n$prompt")) {
      maxOutputTokens = maxTokens
    }
    try {
      return model.generateContent(request).candidates.first().text.trim()
    } catch (e: GenAiException) {
      throw when (e.errorCode) {
        GenAiException.ErrorCode.REQUEST_PROCESSING_ERROR,
        GenAiException.ErrorCode.RESPONSE_GENERATION_ERROR ->
          AiError("ERR_REFUSED", "Gemini Nano declined this text.")
        GenAiException.ErrorCode.REQUEST_TOO_LARGE ->
          AiError("ERR_TOO_LONG", "That is more text than Gemini Nano takes at once.")
        GenAiException.ErrorCode.BUSY,
        GenAiException.ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED ->
          AiError("ERR_QUOTA", "Gemini Nano has done enough for now. Try again later.")
        GenAiException.ErrorCode.BACKGROUND_USE_BLOCKED ->
          AiError("ERR_UNAVAILABLE", "Gemini Nano only answers while Statim is open.")
        else -> AiError("ERR_GENERATION", "Gemini Nano could not answer (error ${e.errorCode}).")
      }
    }
  }

  private suspend fun translate(text: String, target: String): String {
    val destination = TranslateLanguage.fromLanguageTag(target)
      ?: throw AiError("ERR_LANGUAGE_UNSUPPORTED", "ML Kit does not translate into this language.")
    val detected = identifier.identifyLanguage(text).await()
    val source = detected.takeIf { it != LanguageIdentifier.UNDETERMINED_LANGUAGE_TAG }
      ?.let { TranslateLanguage.fromLanguageTag(it) }
      ?: throw AiError("ERR_LANGUAGE_UNSUPPORTED", "Could not tell which language this is.")
    if (source == destination) return text

    val options = TranslatorOptions.Builder()
      .setSourceLanguage(source)
      .setTargetLanguage(destination)
      .build()
    return Translation.getClient(options).use { translator ->
      try {
        translator.downloadModelIfNeeded().await()
      } catch (e: Exception) {
        throw AiError("ERR_LANGUAGE_MISSING", "The language needs a one-time download.")
      }
      text.split("\n")
        .map { line -> if (line.isBlank()) line else translator.translate(line).await() }
        .joinToString("\n")
    }
  }
}
