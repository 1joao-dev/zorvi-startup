# Marketing HQ — Gemini API setup

The `marketing-hq` Supabase Edge Function uses Google's Gemini Developer API directly. It does not depend on Lovable AI Gateway.

## One-time setup

1. Open [Google AI Studio API keys](https://aistudio.google.com/app/apikey) and sign in.
2. Select **Create API key** (Google may create a project automatically).
3. Copy the key. Do not commit it, paste it in chat, or add it to Vercel/browser environment variables.
4. Open the existing ZORVI project in [Supabase](https://supabase.com/dashboard/project/pmciixclguadvkfhndcf).
5. Go to **Edge Functions → Secrets**.
6. Add a secret with:
   - Name: `GEMINI_API_KEY`
   - Value: paste the key copied from Google AI Studio
7. Save. Supabase makes new secrets available to Edge Functions immediately; redeployment is not required.

## Model and privacy

- Model: `gemini-2.5-flash`
- API: Gemini Developer API `generateContent`
- The API key is read only by the Edge Function as `Deno.env.get("GEMINI_API_KEY")`.
- Never expose the key to browser code, GitHub, Vercel client variables, or chat.
- Google documents a free tier, but availability, quotas, and model limits can change. Review current terms and usage in AI Studio before using customer-sensitive information. On the free tier, submitted content may be used to improve Google's products; do not send secrets, credentials, or sensitive customer data.

## Validation

After saving the secret, create a small test task in Marketing HQ. A successful execution should finish the internal Copywriter → Reviewer sequence and create a pending owner approval. No external publishing, messaging, advertising, or spending is performed.
