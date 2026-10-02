export interface CompletionRequest {
  readonly instructions: string;
  readonly prompt: string;
}

export interface AiProvider {
  /** Shown under every answer: the model, and where it ran. */
  readonly label: string;
  readonly onDevice: boolean;
  /** How much text one request may carry, instructions included. */
  readonly maxInputChars: number;
  complete(request: CompletionRequest): Promise<string>;
}

export interface AiAnswer {
  readonly text: string;
  readonly label: string;
}
