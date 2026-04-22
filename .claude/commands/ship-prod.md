Push Henry MCS to production. $ARGUMENTS

Work through each step in order.

---

## 1. Check working state

- [ ] Run `git status` to check for uncommitted changes
- [ ] Run `git diff` to review any unstaged changes
- [ ] If there are uncommitted changes, ask the user whether to commit them before proceeding or abort

---

## 2. Commit (if needed)

- [ ] Stage relevant files (never use `git add -A` blindly — exclude any .env or secrets)
- [ ] Write a concise commit message describing what is shipping
- [ ] Commit with:
  ```
  git commit -m "$(cat <<'EOF'
  <message here>

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## 3. Push to GitHub

- [ ] Run `git push origin master`
- [ ] Confirm push succeeded with no errors

---

## 4. Deploy to Vercel

- [ ] Run `vercel --prod`
- [ ] Wait for deployment to complete
- [ ] Confirm the deployment URL and that it finished without errors

---

## 5. Verify

- [ ] Note the production URL from the Vercel output
- [ ] Let the user know the deployment is live and the URL
