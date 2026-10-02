export interface CompletionRequest {
  readonly instructions: string;
  readonly prompt: string;
  /** Where an on-device model stops; left to the model on a server. */
  readonly maxAnswerTokens: number;
}

export interface AiProvider {
  /** Shown under every answer: the model, and where it ran. */
  readonly label: string;
  /** How much text one request may carry, instructions included. */
  readonly maxInputChars: number;
  complete(request: CompletionRequest): Promise<string>;
}

export interface AiAnswer {
  readonly text: string;
  readonly label: string;
}
