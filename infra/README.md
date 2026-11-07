# Rowan Copy on DigitalOcean (Caddy) — setup guide

These scripts set up the new hosting. **You run them yourself.** Nothing here changes DNS,
moves customer data or touches the Plesk server. Until you change
`'hosting' => ['provider' => ...]` from `plesk` to `files`, the app works exactly as before.

## How it fits together

```
                       rowancopy.com (DNS A → builder's public IP)
                                   │
                         ┌─────────▼─────────┐
 customers build here ──►│  builder droplet  │  PHP app + SQLite (local disk)
                         │  Caddy + PHP-FPM  │  writes published sites to /srv
                         └───┬───────────▲───┘
                 NFS (/srv)  │           │ private network :8080
                             │           │ "may I get a certificate for joesbakery.com?"
   ┌─────────────────────────▼───┐       │
   │ DigitalOcean NFS share /srv │       │
   │  sites/<domain> → releases/ │       │
   │  caddy/storage (certs)      │       │
   └──┬───────────┬───────────┬──┘       │
      │           │           │          │
   ┌──▼──┐     ┌──▼──┐     ┌──▼──┐       │
   │web 1│     │web 2│     │web 3│ ──────┘   Caddy, file_server only
   └──▲──┘     └──▲──┘     └──▲──┘
      └───────────┼───────────┘
          load balancer (TCP 80→80, 443→443, health: HTTP :80 /health)
                  ▲
   joesbakery.com (customer's A record → load balancer IP)
```

- **Customer sites** are static files. When a customer publishes, the builder writes the page and
  its images to a new folder and switches `/srv/sites/<domain>` to it in one step, so visitors
  never see a half-finished site. `www.` redirects to the bare domain.
- **The builder is a separate, 4th droplet.** Its database is SQLite, which must not be shared over NFS
  by several servers. If the builder is down, customer sites stay up; only building, contact forms and
  the visit counter wait.
- **Certificates:** the first HTTPS visit to a customer domain makes Caddy ask the builder
  (`/caddy/domain-check`). The builder says yes only for a published, not-taken-down site whose owner
  isn't suspended and whose DNS check passed. The web droplets share certificates through `/srv/caddy/storage`.

## 1. In the DigitalOcean console

1. **VPC:** one region, one VPC for everything below.
2. **Network File Storage:** create a share in that VPC. Open its **mount instructions** and copy the
   source (looks like `10.x.x.x:/<id>/<name>`). That's `NFS_SOURCE` below.
3. **Droplets (Ubuntu 24.04, in the VPC):** 3 web droplets and 1 builder droplet. Note the builder's
   **private** IP (`ip -4 addr show eth1`) and **public** IP.
4. **Load balancer (regional, same VPC):** forwarding rules **TCP 80 → 80** and **TCP 443 → 443**;
   health check **HTTP, port 80, path `/health`**; add the 3 web droplets. Note its IP.
   Leave PROXY protocol **off** unless you also turn it on in `web/Caddyfile` (see the comment there).
5. **Cloud Firewalls** (in addition to the `ufw` rules the scripts set):
   - Web droplets: inbound 80 and 443 **from the load balancer only**; 22 from your own IP.
   - Builder: inbound 80 and 443 from anywhere; 8080 **from the web droplets only** (by tag);
     22 from your own IP.

## 2. Set up the builder (first)

The web droplets check the builder's domain check while they're set up, so do this one first.

```bash
git clone https://github.com/Jamesrowan11/rowan-copy-.git /tmp/rowan-copy && cd /tmp/rowan-copy
```
```bash
sudo NFS_SOURCE='10.x.x.x:/<id>/<name>' PRIVATE_IP='10.x.x.x' ACME_EMAIL='you@rowancopy.com' \
  bash infra/builder/setup-builder-droplet.sh
```

The repository is cloned with `https://`. If it's private, set `REPO_URL` to an SSH address
and add a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) first.

Then:

1. Edit `/etc/rowancopy/config.php` (outside the app folder, readable only by root and PHP). Copy the
   values from your Plesk `config.php`, and change these:
   ```php
   'data_dir' => '/var/lib/rowancopy',
   'hosting'  => ['provider' => 'files', 'lb_ip' => '<load balancer IP>'],
   ```
   Keep `'provider' => 'plesk'` until you're ready to move customer domains (step 5).
2. Put secrets in `/etc/rowancopy/secrets.env`, one per line, then run
   `sudo bash infra/builder/load-secrets.sh`:
   ```
   ZEPTOMAIL_TOKEN=...            # ZeptoMail → Mail Agents → SMTP/API → Send Mail token
   ZEPTOMAIL_API_HOST=api.zeptomail.com   # .eu / .in / .com.au if your Zoho account is in that region
   MAIL_FROM=noreply@rowancopy.com
   ```

## 3. Set up each web droplet

On each of the 3, with the same values:

```bash
sudo NFS_SOURCE='10.x.x.x:/<id>/<name>' ASK_URL='http://<builder private IP>:8080/caddy/domain-check' \
  ACME_EMAIL='you@rowancopy.com' bash infra/web/setup-web-droplet.sh
```

The script stops and removes Nginx, installs Caddy (with the same `caddy` user ID on every droplet,
so the shared certificate folder works), mounts `/srv` and turns on the firewall.

**If `chown` fails on `/srv`:** the NFS share is mapping root to "nobody". Run the script on the
builder first (it creates the folders), or ask DigitalOcean support about root squashing on the share.

## 4. Test before any customer uses it

Publish one test site on a spare domain whose A records point at the load balancer, then:

```bash
bash infra/test-web-droplet.sh <web droplet IP> <test domain>
```
```bash
bash infra/test-web-droplet.sh <load balancer IP> <test domain>
```

It checks the health endpoint, the http→https and www redirects, the sandbox header, and that
`Host: ..` and other Host tricks can't reach anything (they must get **421**). **Don't move customers
until every check passes.** The original Caddy config from the migration brief failed this test: `Host: ..`
returned files from `/srv/caddy/storage`, where the certificate private keys are.

## 5. Switching customer domains (needs your go-ahead; not done yet)

Planned for after the new path works. In outline:

1. Copy the SQLite database and `uploads/` from Plesk to the builder.
2. Set `'provider' => 'files'` and run
   `sudo -u www-data RC_CONFIG=/etc/rowancopy/config.php php cli/publish-all.php`.
3. Customers change their A records to the load balancer IP. Their domains stay on Plesk until they do.
4. Move `rowancopy.com`'s A record to the builder's public IP.

Not covered by the new hosting yet, pending your decisions:
- **Customer mailboxes** (today in Plesk, on the Domains/Dashboard pages). The provider reports no email
  on `files`, so new domains get web records only.
- **The customer DNS editor** (it edits Plesk's DNS).
- **Staff mailboxes** made on Admin → Team (made in Zoho Mail instead).
- **Existing non-builder sites on Plesk** (e.g. WordPress) can't run on static Caddy.

## 6. Email DNS records for rowancopy.com

| Type | Host | Value | For |
|---|---|---|---|
| MX | @ | `mx.zoho.com` (priority 10) | Zoho Mail |
| MX | @ | `mx2.zoho.com` (priority 20) | Zoho Mail |
| MX | @ | `mx3.zoho.com` (priority 50) | Zoho Mail |
| TXT | @ | `v=spf1 include:zohomail.com include:zeptomail.net ~all` | SPF for both (**one** record only) |
| TXT | `<selector>._domainkey` | from Zoho Mail → Domains → DKIM | Zoho Mail DKIM |
| TXT | `<selector>._domainkey` | from ZeptoMail → Domains (a different selector) | ZeptoMail DKIM |
| CNAME | e.g. `bounce-zem` | the value ZeptoMail shows (`…zeptomail.com`) | ZeptoMail bounce address |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@rowancopy.com` | DMARC (start at `p=none`) |

- **Copy the values exactly from your Zoho consoles.** The DKIM values are unique to your account.
  Zoho Mail may show `include:zoho.com` or a regional include (`zoho.eu`); use whatever it shows, in
  the same single SPF record.
- **Use the MX hosts your Zoho Mail console shows.** They're regional too (e.g. `mx.zoho.eu`).
- **While Plesk is still sending mail** (before you set `ZEPTOMAIL_TOKEN`), add `ip4:<Plesk server IP>`
  to the SPF record, or those emails may go to spam.
- **Moving the MX records** moves where `@rowancopy.com` mail is delivered. Create the mailboxes in
  Zoho first.
- After a week of clean DMARC reports, tighten DMARC to `p=quarantine`.
