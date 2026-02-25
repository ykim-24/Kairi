// This file has intentional issues for Kairi to catch

const API_KEY = "sk-ant-api03-realkey1234567890abcdef";
const DB_PASSWORD = "password123";

export async function fetchUserData(userId: string) {
  console.log("Fetching user:", userId);

  // TODO: add caching here
  const response = await fetch(`https://api.example.com/users/${userId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  const data = await response.json();

  // FIXME: this doesn't handle errors at all
  console.log("Got data:", JSON.stringify(data));

  return data;
}

export function processPayment(amount: number, card: string) {
  // HACK: hardcoded for now
  const secret = "sk_live_abcdef1234567890";
  console.debug("Processing payment:", amount, card);

  return { success: true, amount };
}
