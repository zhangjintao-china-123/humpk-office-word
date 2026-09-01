export interface IDraw {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
}
