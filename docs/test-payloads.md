# SecureIntent — Manual Test Payloads

All values below are **synthetic / fake** (structurally valid, not real credentials). Use them to
test the paste guard on `chatgpt.com`. Build + load `dist/chrome-mv3` unpacked, open ChatGPT, and
paste each into the prompt box.

Expected: pasting a **positive** payload blocks the paste and shows the SecureIntent overlay.
Pasting a **negative** payload does nothing (paste goes through normally).

---

## Positives — should trigger the overlay

### OpenAI API key
```
sk-abcdefghijklmnopqrstuvwxyz012345
```

### AWS access key ID
```
AKIAIOSFODNN7EXAMPLE
```

### GitHub token
```
ghp_1234567890abcdefghijklmnopqrstuvwxyzAB
```

### Google API key
```
AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456
```

### Stripe secret key
```
sk_live_0123456789abcdefghijABCD
```

### Slack token
```
xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUv
```

### JWT
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### Private key (PEM) — paste the whole block
```
-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBAKj34GkxuY8Hj+89dQ8nA0Z3a8aPq1mXyz7vQ2bN0kLpQ9rStuVwX
yZ0123456789abcdefABCDEF==
-----END RSA PRIVATE KEY-----
```

### Credential assignment (.env style)
```
PASSWORD=SuperSecret123!
```
```
API_KEY=abcdef1234567890
```

### Connection string with inline credentials
```
postgres://admin:s3cr3tP4ss@db.example.com:5432/app
```

---

## Combined cases

### Multiple secrets in one paste (overlay should list 2)
```
aws AKIAIOSFODNN7EXAMPLE and openai sk-abcdefghijklmnopqrstuvwxyz012345
```

### Overlap — key inside an env assignment (should show ONE detection, the OpenAI key)
```
API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345
```

### Secret embedded in a sentence (good for testing "Paste redacted")
```
Hey can you debug this? my key is sk-abcdefghijklmnopqrstuvwxyz012345 and it 401s.
```
After clicking **Paste redacted**, the inserted text should keep the sentence but replace the key
with a `[redacted …]` placeholder.

---

## Negatives — should NOT trigger (paste goes through)

```
The quick brown fox jumps over the lazy dog.
```
```
sk-short
```
```
name=John
```
```
function add(a, b) { return a + b; }
```
