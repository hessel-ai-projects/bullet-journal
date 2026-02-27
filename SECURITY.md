# Security Rules for Bullet Journal Project

## Environment Variables - HARDCODED RULE

**AI agents (including me) must NEVER read `.env`, `.env.local`, or any `.env.*` files.**

### Why
These files contain sensitive secrets:
- Database passwords
- API keys
- OAuth credentials
- Authentication secrets

### What To Do Instead
When environment variables need to be changed:

1. **Ask the user** to add/update them in Vercel Dashboard:
   - Vercel Dashboard → Project → Settings → Environment Variables

2. **Provide the command** for them to run locally:
   ```bash
   # Example of what to tell the user:
   echo "DATABASE_URL=your-connection-string" >> .env.local
   ```

3. **Never display secrets** in conversation

### If You Need To Check Config
Ask the user:
> "Can you confirm the environment variables are set in Vercel? I need: DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, JARVIS_API_KEY"

### This Rule Applies To All Agents
- Developer
- Architect
- Designer
- QA
- DevOps
- Any future agents

**No exceptions. Secrets stay secret.**
