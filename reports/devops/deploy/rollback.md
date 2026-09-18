# Rollback & Disaster Recovery Plan

**Service:** CashClaw AI Trading Bot (`cashclaw-trading-bot`)  
**Deployment Platform:** Cloudflare Workers Edge Runtime  
**Active Production Version:** `af858593-0827-44ae-9b70-733f13f4403e` (Version #105)  
**Rollback Target Version:** `4b875a77-a716-456b-b410-d38c6b8f66cf` (Version #104)  
**Date:** 2026-09-18  

---

## 1. Automated 1-Click Rollback Command

To execute an immediate rollback to the previously active version in < 5 seconds:

```bash
npm run rollback:worker
```

### Underlying Mechanism
The command runs:
```bash
node -e "const{execFileSync}=require('child_process');const list=execFileSync('npx',['wrangler','versions','list','--json']).toString();const versions=JSON.parse(list);const prev=versions.length>1?versions[1].id:null;if(!prev){console.error('No previous version to rollback to');process.exit(1)}console.log('Rolling back to:',prev);execFileSync('npx',['wrangler','rollback',prev,'--yes'],{stdio:'inherit'})"
```

---

## 2. Manual Rollback Procedure (Cloudflare CLI)

In case automated scripts encounter environmental issues:

1. **List Recent Worker Versions:**
   ```bash
   npx wrangler versions list
   ```

2. **Rollback to Specific Target Version ID:**
   ```bash
   npx wrangler rollback 4b875a77-a716-456b-b410-d38c6b8f66cf --yes
   ```

3. **Verify Rollback Traffic:**
   ```bash
   curl -sS https://cashclaw-trading-bot.agencyos-openclaw.workers.dev/api/version
   ```

---

## 3. Database (D1) Schema Rollback Considerations

- Database migrations `0001` through `0012` are non-breaking and backward-compatible with older worker versions.
- If data inconsistencies occur, query remote D1 table states:
   ```bash
   npx wrangler d1 execute cashclaw-db --remote --command="SELECT count(*) FROM bots;"
   ```

---

## 4. Triggers for Rollback

Execute rollback immediately if any of the following occur:
1. HTTP 5xx error rate exceeds 1% over a 5-minute window.
2. `/api/health` reports `"db": "error"` or continuous circuit-breaker failure.
3. Unhandled promise rejections detected in live log stream (`npx wrangler tail`).
