# Step 1: Setup and Prerequisites (T01–T05)

> Rule: finish each task's **Done when** list before starting the next task.
> All commands are for **macOS Terminal (zsh)**. Run them from the project root `~/Desktop/SEMACARE` unless a task says otherwise.

---

## T01 · Install and verify local tools

| Depends on | Time | Complexity |
|---|---|---|
| none | 30 min | Low |

**Goal:** every tool the project needs is installed and prints a version.

**Already on this Mac** (checked 30 Sep): Node 22.18.0, npm 10.9.3, Python 3.14.3, Git 2.37.1, macOS 12.7.6 Monterey.
**Missing:** the AWS CLI.

**Steps**
1. Install AWS CLI v2:
   ```bash
   curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "$HOME/Downloads/AWSCLIV2.pkg"
   sudo installer -pkg "$HOME/Downloads/AWSCLIV2.pkg" -target /
   ```
2. Update Google Chrome (Chrome → *About Google Chrome*). Install Microsoft Edge too if you can; it's the second supported browser.
3. Install the VS Code extensions **Tailwind CSS IntelliSense** and **Python**.
4. The Git identity is set **for this project only** in T02 (the Mac's global Git identity belongs to another person and is left unchanged).
5. Verify:
   ```bash
   node -v && npm -v && python3 -V && git --version && aws --version
   ```

**Done when**
- [ ] `aws --version` prints `aws-cli/2.x`
- [ ] `node -v` is v22.12 or newer (Vite needs at least 20.19 or 22.12)
- [ ] `python3 -V` is 3.12 or newer
- [ ] Chrome is up to date

**Pitfalls**
- Don't install Node 24 on Monterey; it needs macOS 13.5 or later. Stay on Node 22.
- If `aws` isn't found after installing, open a new terminal window.

---

## T02 · Initialise the Git repository

| Depends on | Time | Complexity |
|---|---|---|
| T01 | 10 min | Low |

**Goal:** the project, including these docs, is under version control with secrets ignored.

**Steps**
1. Run:
   ```bash
   git init -b main
   git config user.name "Talha Usman"                          # local: this repository only
   git config user.email "danishraza03159590965@gmail.com"
   git add .
   git commit -m "T02: project structure, design docs and task plan"
   ```
2. (Recommended) Create a **private** GitHub repository named `semacare` and push:
   ```bash
   git remote add origin https://github.com/danishraza03159590965-eng/semacare.git
   git push -u origin main
   ```
3. From now on, commit after every task: `git add . && git commit -m "T0X: <title>"`.

**Done when**
- [ ] `git log --oneline` shows the first commit
- [ ] `git check-ignore -v backend/.env` prints a matching `.gitignore` rule

---

## T03 · Create and secure the AWS account and CLI profile

| Depends on | Time | Complexity |
|---|---|---|
| T02 | 45 min | Medium |

**Goal:** an AWS account you can use safely from the terminal as profile `semacare`, region `eu-west-2` (London).

**Steps**
1. Sign up at aws.amazon.com. A card is needed for verification.
2. Sign in as root → account menu → *Security credentials* → assign **MFA**. Don't use root again after this.
3. IAM → Users → Create user `talha-admin` with console access and the **AdministratorAccess** policy.
4. For `talha-admin`: *Security credentials* → **Create access key** → *Command Line Interface* → download the CSV.
5. Configure the profile:
   ```bash
   aws configure --profile semacare
   # Access key and secret from the CSV, region eu-west-2, output json
   echo 'export AWS_PROFILE=semacare' >> ~/.zshrc && source ~/.zshrc
   ```
6. Note your 12-digit account ID:
   ```bash
   aws sts get-caller-identity --query Account --output text
   ```
7. In the web console, always switch the region (top right) to **Europe (London)**.

**Done when**
- [ ] `aws sts get-caller-identity` shows `user/talha-admin`
- [ ] Root has MFA enabled
- [ ] The access-key CSV is stored outside the project folder

**Pitfalls**
- Never put access keys in any file inside `SEMACARE/`.
- New accounts can take minutes (rarely hours) to activate every service. If a later command says `SubscriptionRequiredException`, wait and retry.

---

## T04 · Set AWS billing alerts

| Depends on | Time | Complexity |
|---|---|---|
| T03 | 15 min | Low |

**Goal:** you get an email before the project costs real money.

**Steps**
1. Console → **Budgets** → Create budget → template **Zero spend budget** → your email.
2. Create a second budget: template **Monthly cost budget**, amount **$5**, your email.
3. Billing → *Billing preferences* → enable **AWS Free Tier alerts**.
4. Billing → **Credits**: write the free-credit amount in the tracker notes (it goes in the dissertation's cost section).

**Done when**
- [ ] The Budgets page lists both budgets
- [ ] Free-tier alerts are on

---

## T05 · Create the Supabase project and store secrets

| Depends on | Time | Complexity |
|---|---|---|
| T04 | 20 min | Low |

**Goal:** a Postgres database in London, with its URL and secret key stored in `backend/.env` (never committed).

**Steps**
1. supabase.com → New project: name `semacare`, a strong database password, region **West EU (London)**, Free plan.
2. Project Settings → **API Keys**: copy the **secret** key (`sb_secret_…`; or the legacy `service_role` key starting `eyJ…`). This key bypasses all security, so only the Lambdas may use it.
3. Copy the **Project URL** (`https://<ref>.supabase.co`).
4. Create `backend/.env` with these lines and your real values:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_KEY=<secret key>
   AWS_PROFILE=semacare
   AWS_REGION=eu-west-2
   ACCOUNT_ID=<12 digits>
   BUCKET_NAME=
   API_URL=
   ```
   `BUCKET_NAME` is filled in T21 and `API_URL` in T27.
5. Check Git ignores it: `git status --short backend/` must not list `backend/.env`.

**Done when**
- [ ] The Supabase dashboard shows the project as healthy, region London
- [ ] `backend/.env` holds the URL, key and account ID
- [ ] `git status` doesn't show `backend/.env`

**Pitfalls**
- Don't use the publishable/anon key in the backend; it can't read our tables (by design, see T19).
- Free Supabase projects pause after 7 days without activity. Open the dashboard before your demo.
