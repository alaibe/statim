import ExpoModulesCore
import FoundationModels

private func failure(_ code: String, _ description: String) -> Exception {
  Exception(name: "OnDeviceAiError", description: description, code: code)
}

private let needsNewerSystem = failure("ERR_UNAVAILABLE", "This needs iOS 26 or later.")

public class OnDeviceAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnDeviceAi")

    AsyncFunction("modelState") { () -> String in
      guard #available(iOS 26.0, *) else { return "unsupported" }
      switch SystemLanguageModel.default.availability {
      case .available: return "ready"
      case .unavailable(.appleIntelligenceNotEnabled): return "off"
      case .unavailable(.modelNotReady): return "downloading"
      case .unavailable: return "unsupported"
      }
    }

    AsyncFunction("complete") {
      (instructions: String, prompt: String, maxTokens: Int) async throws -> String in
      guard #available(iOS 26.0, *) else { throw needsNewerSystem }
      return try await Model.complete(instructions: instructions, prompt: prompt, maxTokens: maxTokens)
    }

    AsyncFunction("translate") { (text: String, target: String) async throws -> String in
      guard #available(iOS 26.0, *) else { throw needsNewerSystem }
      do {
        return try await AppleTranslation.translate(text, to: target)
      } catch let failed as TranslationFailure {
        throw failure(failed.code, failed.message)
      }
    }
  }
}

@available(iOS 26.0, *)
enum Model {
  static func complete(instructions: String, prompt: String, maxTokens: Int) async throws -> String {
    // The default guardrails refuse ordinary messages, "pick up the kids at 5" among them.
    let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
    guard model.isAvailable else {
      throw failure("ERR_UNAVAILABLE", "Apple Intelligence is not ready on this device.")
    }
    let session = LanguageModelSession(model: model, instructions: instructions)
    let options = GenerationOptions(maximumResponseTokens: maxTokens)
    do {
      return try await session.respond(to: prompt, options: options).content
    } catch {
      throw mapped(error)
    }
  }

  private static func mapped(_ error: Error) -> Exception {
    switch error as? LanguageModelSession.GenerationError {
    case .guardrailViolation?, .refusal?:
      return failure("ERR_REFUSED", "Apple Intelligence declined this text.")
    case .exceededContextWindowSize?:
      return failure("ERR_TOO_LONG", "That is more text than Apple Intelligence takes at once.")
    case .unsupportedLanguageOrLocale?:
      return failure("ERR_REFUSED", "Apple Intelligence does not speak this language yet.")
    default:
      return failure("ERR_GENERATION", "Apple Intelligence could not answer. \(describe(error))")
    }
  }

  /// The framework sometimes throws a bare NSError whose cause sits in its underlying errors.
  private static func describe(_ error: Error) -> String {
    let ns = error as NSError
    let cause = (ns.userInfo[NSMultipleUnderlyingErrorsKey] as? [NSError])?.first
      ?? ns.userInfo[NSUnderlyingErrorKey] as? NSError
    let root = cause ?? ns
    return "(\(root.domain.split(separator: ".").last ?? "") \(root.code))"
  }
}
