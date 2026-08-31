const BASE_URL = "https://devlynlabs.com/api/v1";

async function getCredits(discordId) {
  const key = process.env.DEVLYN_READ_KEY;

  if (!key) {
    throw new Error("DEVLYN_READ_KEY is not configured.");
  }

  const response = await fetch(
    `${BASE_URL}/credits/${discordId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.error || `Devlyn returned HTTP ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data.balance;
}

async function deductCredits(discordId, amount, reason) {
  const key = process.env.DEVLYN_DEDUCT_KEY;

  if (!key) {
    throw new Error("DEVLYN_DEDUCT_KEY is not configured.");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Credit amount must be a positive integer.");
  }

  const response = await fetch(
    `${BASE_URL}/credits/deduct`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        discord_id: discordId,
        amount,
        reason
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.error || `Devlyn returned HTTP ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

module.exports = {
  getCredits,
  deductCredits
};
