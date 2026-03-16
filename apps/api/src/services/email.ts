const MAILVIO_API_BASE = "https://apiv2.mailvio.com";

interface MailvioConfig {
  apiKey: string;
  groupId: number;
  fromAddress: string;
  fromName: string;
  replyAddress: string;
}

function getMailvioConfig(): MailvioConfig {
  const apiKey = process.env.MAILVIO_API_KEY;
  const groupId = Number(process.env.MAILVIO_GROUP_ID);
  const fromAddress = process.env.MAILVIO_FROM_ADDRESS || "support@kyvio.com";
  const fromName = process.env.MAILVIO_FROM_NAME || "SyndCal";
  const replyAddress = process.env.MAILVIO_REPLY_ADDRESS || "support@kyvio.com";

  if (!apiKey || !groupId) {
    throw new Error("MAILVIO_API_KEY and MAILVIO_GROUP_ID are required");
  }

  return { apiKey, groupId, fromAddress, fromName, replyAddress };
}

async function mailvioRequest(path: string, body: object, apiKey: string) {
  const res = await fetch(`${MAILVIO_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Mailvio API error: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Send a transactional email via Mailvio
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const config = getMailvioConfig();

  const payload = {
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    replyAddress: config.replyAddress,
    toAddress: to,
    subject,
    html,
    trackOpens: true,
    trackLinks: true,
  };

  try {
    const result = await mailvioRequest("/transaction", payload, config.apiKey);
    console.log("[mailvio] Transactional email sent:", { to, subject, id: result.id });
    return result;
  } catch (err) {
    console.error("[mailvio] Failed to send email:", err);
    throw err;
  }
}

/**
 * Add a subscriber to the Mailvio group
 */
export async function addSubscriber(email: string, firstName?: string) {
  const config = getMailvioConfig();

  const payload: any = {
    emailAddress: email,
    active: true,
  };

  if (firstName) {
    payload.customFields = {
      FIRSTNAME: firstName,
    };
  }

  try {
    const result = await mailvioRequest(`/group/${config.groupId}/subscriber`, payload, config.apiKey);
    console.log("[mailvio] Subscriber added:", { email, firstName, subscriberId: result.Subscriber?.subscriberId });
    return result;
  } catch (err) {
    console.error("[mailvio] Failed to add subscriber:", err);
    // Don't throw - subscriber addition is not critical for registration
  }
}
