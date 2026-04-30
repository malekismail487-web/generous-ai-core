# Generous AI Core - Robot API Documentation

This document describes how to integrate your robot with the Generous AI Core education platform via API.

---

## Overview

The Robot API allows external applications and robots to:
- Send chat messages to Lumina (the AI tutor)
- Receive streaming responses with thinking blocks and confidence scores
- Track API usage and rate limits
- Manage multiple API keys per user

### Base URL

```
https://[your-supabase-url]/functions/v1
```

### Authentication

All endpoints require an API key passed in the `x-api-key` header:

```
x-api-key: sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1
```

API keys are opaque tokens starting with `sk_`. **Never share your API key publicly.**

---

## Creating API Keys

### Endpoint: `POST /create-api-key`

Generate a new API key for your robot.

**Authentication:** Bearer token (user's auth token from Supabase)

**Request:**

```bash
curl -X POST https://[your-supabase-url]/functions/v1/create-api-key \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Robot v1",
    "expires_in_days": 90,
    "rate_limit_rpm": 60,
    "rate_limit_rpd": 1000
  }'
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Human-readable name for this key (e.g., "Discord Bot", "Telegram Integration") |
| `expires_in_days` | number | No | Days until key expires (default: no expiration). Must be > 0. |
| `rate_limit_rpm` | number | No | Requests per minute (default: 60, max: 1000) |
| `rate_limit_rpd` | number | No | Requests per day (default: 1000, max: 100000) |

**Response (201 Created):**

```json
{
  "success": true,
  "key": "sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1",
  "preview": "sk_MzUx...",
  "name": "My Robot v1",
  "created_at": "2026-04-30T10:30:00Z",
  "expires_at": "2026-07-29T10:30:00Z",
  "rate_limit_rpm": 60,
  "rate_limit_rpd": 1000,
  "message": "⚠️  Save this key now! You won't be able to see it again."
}
```

**Important:** The full API key is only shown once. Save it immediately. You cannot retrieve it again.

**Error Responses:**

```json
// 401 Unauthorized
{ "error": "Invalid or expired token" }

// 400 Bad Request
{ "error": "Missing or invalid 'name' field" }

// 500 Server Error
{ "error": "Failed to create API key" }
```

---

## Sending Chat Messages

### Endpoint: `POST /robot-chat`

Send a message to Lumina and receive a streaming response.

**Authentication:** API Key (via `x-api-key` header)

**Request:**

```bash
curl -X POST https://[your-supabase-url]/functions/v1/robot-chat \
  -H "x-api-key: sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Explain photosynthesis" }
    ],
    "temperature": 0.2,
    "max_tokens": 2000
  }'
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `messages` | array | Yes | Array of message objects with `role` ("user"/"assistant") and `content` (string) |
| `temperature` | number | No | Randomness (0-1, default: 0.2). Lower = more focused, Higher = more creative |
| `max_tokens` | number | No | Max response length (default: 2000, max: 4000) |

**Example Messages Array:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What is the quadratic formula?"
    },
    {
      "role": "assistant",
      "content": "The quadratic formula is: x = (-b ± √(b² - 4ac)) / 2a"
    },
    {
      "role": "user",
      "content": "How do I use it to solve x² + 2x + 1 = 0?"
    }
  ]
}
```

**Response: Streaming (text/event-stream)**

The response is a Server-Sent Events stream. Each event is formatted as:

```
data: {"choices":[{"delta":{"content":"The"}}]}
data: {"choices":[{"delta":{"content":" quadratic"}}]}
data: {"choices":[{"delta":{"content":" formula"}}]}
...
data: [DONE]
```

**Parsing the Stream (JavaScript):**

```javascript
const response = await fetch('https://[your-supabase-url]/functions/v1/robot-chat', {
  method: 'POST',
  headers: {
    'x-api-key': 'sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain photosynthesis' }],
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullResponse = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        console.log('Stream complete');
        break;
      }
      try {
        const json = JSON.parse(jsonStr);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          process.stdout.write(content); // Print in real-time
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
}

console.log('Full response:', fullResponse);
```

**Parsing the Stream (Python):**

```python
import requests
import json

url = 'https://[your-supabase-url]/functions/v1/robot-chat'
headers = {
    'x-api-key': 'sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1',
    'Content-Type': 'application/json',
}
payload = {
    'messages': [
        {'role': 'user', 'content': 'Explain photosynthesis'}
    ],
}

response = requests.post(url, headers=headers, json=payload, stream=True)
full_response = ''

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data_str = line[6:].strip()
            if data_str == '[DONE]':
                break
            try:
                data = json.loads(data_str)
                content = data.get('choices', [{}])[0].get('delta', {}).get('content')
                if content:
                    full_response += content
                    print(content, end='', flush=True)
            except json.JSONDecodeError:
                pass

print(f'\nFull response: {full_response}')
```

**Special Response Features:**

Lumina may include these tags in responses (for non-streaming messages):

```
<thinking>
Internal reasoning about the problem...
</thinking>

Your answer here...

<confidence level="4">
This answer is well-verified. Level: 4/5
</confidence>

<mood>neutral</mood>
```

These are automatically parsed and displayed in the UI. For API usage, you can parse these tags or simply use the main content.

**Error Responses:**

```json
// 401 Unauthorized
{ "error": "Invalid API key format" }

// 403 Forbidden
{ "error": "API key not found" }

// 429 Too Many Requests
{ "error": "Rate limit (60 req/min) exceeded" }

// 400 Bad Request
{ "error": "Invalid request: messages must be an array" }

// 500 Server Error
{ "error": "Failed to get AI response" }
```

---

## Rate Limiting

Each API key has configurable rate limits:

- **RPM (Requests Per Minute):** Default 60, max 1000
- **RPD (Requests Per Day):** Default 1000, max 100000

When limits are exceeded, the API returns:

```json
{
  "status": 429,
  "error": "Rate limit (60 req/min) exceeded"
}
```

**Recommended Retry Strategy:**

```javascript
async function makeRobotChatRequest(messages, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('[robot-chat-url]', {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: JSON.stringify({ messages }),
      });

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited. Waiting ${backoffMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        } else {
          throw new Error('Max retries exceeded');
        }
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
}
```

---

## Code Examples

### JavaScript/Node.js

```javascript
const API_KEY = 'sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1';
const BASE_URL = 'https://[your-supabase-url]/functions/v1';

class LuminaClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(userMessage, previousMessages = []) {
    const messages = [
      ...previousMessages,
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(`${BASE_URL}/robot-chat`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
    }

    let fullResponse = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const json = JSON.parse(jsonStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) fullResponse += content;
          } catch (e) {}
        }
      }
    }

    return fullResponse;
  }
}

// Usage
const lumina = new LuminaClient(API_KEY);
const answer = await lumina.chat('What is photosynthesis?');
console.log(answer);
```

### Python

```python
import requests
import json

class LuminaClient:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url

    def chat(self, user_message, previous_messages=None):
        if previous_messages is None:
            previous_messages = []

        messages = [
            *previous_messages,
            {'role': 'user', 'content': user_message},
        ]

        headers = {
            'x-api-key': self.api_key,
            'Content-Type': 'application/json',
        }
        payload = {'messages': messages}

        response = requests.post(
            f'{self.base_url}/robot-chat',
            headers=headers,
            json=payload,
            stream=True,
        )

        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"API error: {error_data.get('error')}")

        full_response = ''
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data_str = line[6:].strip()
                    if data_str == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        content = data.get('choices', [{}])[0].get('delta', {}).get('content')
                        if content:
                            full_response += content
                    except json.JSONDecodeError:
                        pass

        return full_response

# Usage
client = LuminaClient(
    api_key='sk_MzUxODI0NzAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1',
    base_url='https://[your-supabase-url]/functions/v1',
)
answer = client.chat('What is photosynthesis?')
print(answer)
```

---

## API Key Management Best Practices

1. **Store Securely:** Use environment variables or secure vaults, never hardcode keys
2. **Rotate Regularly:** Create new keys and deactivate old ones periodically
3. **Use Expiration:** Set `expires_in_days` when creating keys for temporary access
4. **Monitor Usage:** Check API call logs to detect unusual activity
5. **Minimal Permissions:** Create separate keys for different robots/services
6. **Never Log Keys:** Don't log API keys in debug output or error messages

---

## Troubleshooting

### "Invalid API key format"
- Ensure your key starts with `sk_`
- Check that the key is complete (not truncated)
- Verify the `x-api-key` header is set correctly

### "API key not found"
- Key may have been deleted or revoked
- Create a new key using the `/create-api-key` endpoint

### "Rate limit exceeded"
- Reduce request frequency or increase limits when creating the key
- Implement exponential backoff retry logic

### "Failed to get AI response"
- The AI service may be temporarily unavailable
- Implement retry logic with exponential backoff

### Empty or incomplete responses
- Check that your streaming parser correctly handles the event format
- Ensure you're reading from `response.body` until `[DONE]` is received

---

## Support & Security

- **Security Issues:** Do not share API keys. If compromised, delete the key immediately.
- **Questions?** Check the [main README](./README.md) for more information
- **Rate Limit Increases:** Contact support to request higher limits

---

**Last Updated:** 2026-04-30  
**API Version:** 1.0
