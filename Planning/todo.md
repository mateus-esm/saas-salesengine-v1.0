# TODO — do later

## Security: rotate exposed keys
Old `.env` is in git history (commit `15a4f80`) and keys were pasted in chat. Rotate all:

- [ ] Supabase service-role key
- [ ] Supabase access token
- [ ] Supabase JWT secret
- [ ] Database password
- [ ] OpenAI key
- [ ] Anthropic key
- [ ] Gemini key
- [ ] Groq key
- [ ] Verboo key
- [ ] `AGENT_INTERNAL_TOKEN`

Note: when setting `DATABASE_URL`, URL-encode the password (`%`→`%25`, `@`→`%40`).
