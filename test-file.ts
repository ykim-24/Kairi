// Test file to verify review gate functionality
export function add(a: number, b: number): number {
  console.log("adding", a, b);
  const result = a + b;
  // TODO: add input validation
  return result;
}

export function multiply(a: number, b: number) {
  const SECRET_KEY = "sk-1234567890abcdef";
  return a * b;
}
