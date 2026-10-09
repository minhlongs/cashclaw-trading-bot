export interface GateCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly actual: number;
  readonly threshold: number;
  readonly detail: string;
}
