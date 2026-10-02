# Hackathon Development Rules

This project is being developed during a 48-hour hackathon.

The primary goal is to produce a stable, demonstrable product within the
limited competition time.

---

## 1. Priority

Always follow this priority order:

1. Working demo
2. Stability
3. Core user value
4. Demo experience
5. UI polish
6. Extra features
7. Code elegance and refactoring

A working and stable implementation is more valuable than a technically
perfect but unfinished implementation.

Do not overengineer.

Prefer the simplest reliable solution that can be completed and demonstrated
within the hackathon.

---

## 2. Before Making Changes

Before making significant changes:

- Inspect the existing project structure.
- Read relevant existing code first.
- Understand the current architecture before modifying it.
- Preserve functionality that already works.
- Check whether a simpler solution already exists in the project.
- Do not replace the current technology stack without a strong reason.
- Do not perform large refactors only for code cleanliness.

If a major architectural change is necessary:

1. Explain why it is necessary.
2. Identify what existing functionality may be affected.
3. Create a Git checkpoint before making the change.
4. Make the smallest reasonable change.

---

## 3. Development Workflow

For every feature:

1. Understand the requirement.
2. Inspect the relevant existing code.
3. Implement the smallest working version.
4. Build or run the project.
5. Run relevant tests if available.
6. Verify the actual user flow.
7. Fix obvious errors.
8. Commit the completed working state.

Do not consider a feature complete only because the code looks correct.

Verify that the feature actually works.

For important functionality, verify the full flow:

input
→ processing
→ API/backend/database if applicable
→ output
→ user-visible result

---

# Git Rules

Git history is important for this hackathon.

Use Git continuously throughout development.

---

## 4. Repository Initialization

At the beginning of the project:

- Initialize Git immediately.
- Connect the repository to GitHub or Gitee.
- Create a basic README.md.
- Create an appropriate .gitignore.
- Make an initial commit before major development begins.

The first commit should represent the initial project state.

Example:

git commit -m "chore: initialize project"

Do not wait until the project is almost finished before creating the repository.

---

## 5. Commit Frequently

Create commits at meaningful development milestones.

Good examples:

git commit -m "feat: implement initial landing page"

git commit -m "feat: connect AI API"

git commit -m "feat: complete core user workflow"

git commit -m "fix: handle API request failures"

git commit -m "fix: improve demo stability"

git commit -m "docs: update setup instructions"

git commit -m "chore: prepare submission build"

Prefer several understandable commits over one huge final commit.

However, do not create meaningless commits for every tiny edit.

A commit should normally represent:

- one completed feature,
- one bug fix,
- one meaningful improvement,
- one documentation update,
- or one stable checkpoint.

---

## 6. Commit Message Style

Prefer these commit prefixes:

- feat: new functionality
- fix: bug fix
- docs: documentation
- style: visual/UI-only change
- refactor: code restructuring without changing behavior
- test: tests
- chore: configuration, dependencies, setup, or maintenance

Keep commit messages short and descriptive.

Bad:

update

fix stuff

final

123

Good:

feat: add image analysis workflow

fix: prevent duplicate API requests

docs: add local development instructions

---

## 7. Protect Working States

Before performing risky or large changes:

- Check Git status.
- Make sure important current work is saved.
- Create a checkpoint commit if the current version works.

Example:

git add .
git commit -m "chore: checkpoint before backend refactor"

If a working demo exists, protect it.

Do not destroy a known-working version while experimenting.

---

## 8. Dangerous Git Operations

Do NOT use destructive Git commands unless explicitly requested and clearly
necessary.

Avoid:

git reset --hard

git clean -fd

git checkout -- .

git restore .

git push --force

git push --force-with-lease

Do not rewrite shared Git history during the hackathon.

Do not delete branches containing unmerged work.

Do not remove another team member's changes without understanding them.

Never discard uncommitted work unless the user explicitly approves it.

---

## 9. Pull Before Push

When working with teammates:

Before pushing significant work:

1. Check repository status.
2. Fetch or pull the latest remote changes.
3. Resolve conflicts carefully.
4. Verify the project still works.
5. Push the result.

Do not blindly overwrite another teammate's work.

If conflicts occur:

- inspect both versions,
- preserve valid work from both sides when possible,
- do not automatically choose one side for the entire file unless appropriate.

---

## 10. Branches

For simple and low-risk changes, working directly on the team's agreed
development branch is acceptable if that is the team's workflow.

For risky, experimental, or large features, prefer a separate branch.

Examples:

feature/ai-chat

feature/dashboard

fix/demo-crash

experiment/new-model

Do not create unnecessary branches for trivial changes.

Before merging a feature branch:

- build the project,
- test the feature,
- verify the main demo flow,
- check that existing functionality still works.

---

## 11. Main Branch Protection

Treat `main` as the stable demonstration branch.

Whenever possible:

- keep `main` runnable,
- do not commit obviously broken experimental code to `main`,
- test significant changes before merging them.

Once a stable demo exists, avoid making risky changes directly on `main`.

---

## 12. Never Commit Secrets

Never commit:

- API keys
- access tokens
- passwords
- database credentials
- private keys
- service-account credentials
- `.env` containing real secrets

Use environment variables instead.

Keep secrets in files such as:

.env

and ensure they are included in:

.gitignore

Provide an example configuration when useful:

.env.example

Example:

OPENAI_API_KEY=
DATABASE_URL=

The example file must not contain real credentials.

---

## 13. README Maintenance

Create README.md at the beginning of the project.

The first version may be simple.

Initially include:

- project name
- one-sentence project description
- target user/problem
- technology stack

As development progresses, keep the README updated.

Before final submission it should contain:

- project overview
- problem being solved
- main features
- architecture or technology stack
- installation instructions
- environment requirements
- configuration instructions
- how to run the project
- demo instructions
- AI tools/models used
- external APIs used
- open-source dependencies or important external resources
- known limitations if relevant

Do not wait until the final hour to write the entire README.

---

## 14. Dependencies

Do not introduce a new dependency when the existing stack can reasonably solve
the problem.

Before adding an important dependency:

- check whether it is actually necessary,
- prefer mature and reliable libraries,
- avoid unnecessary framework changes.

Do not upgrade major framework versions during the hackathon unless required.

Avoid dependency changes that risk breaking the working demo.

---

## 15. Error Handling

Demo-critical functionality should fail gracefully.

For external services such as:

- AI APIs
- databases
- cloud services
- authentication
- third-party APIs

Handle common failures when practical.

Do not expose raw exceptions, stack traces, secrets, or internal configuration
to the user.

Provide understandable error messages.

---

## 16. Demo Reliability

The demo path is the most important part of the application.

Always protect the core demo flow.

The main demo should:

- start reliably,
- be easy to explain,
- avoid unnecessary steps,
- produce a visible result quickly,
- recover reasonably from common failures.

If an experimental feature threatens demo stability, disable or remove the
experimental feature rather than risking the entire demonstration.

---

## 17. Local Demo Fallback

When practical, keep the project runnable locally even if the primary
deployment uses cloud services.

Do not make the entire demo unnecessarily dependent on one fragile external
service.

Where appropriate, prepare fallback behavior for:

- network failure
- API failure
- model failure
- deployment failure
- database connectivity failure

A reliable local demonstration is preferable to a sophisticated cloud
architecture that may fail during judging.

---

## 18. Testing

Prioritize tests around important functionality.

Testing priority:

1. Core demo flow
2. Critical backend/API logic
3. Data persistence
4. Important user interactions
5. Secondary features

Do not spend excessive hackathon time building a huge test suite for
non-critical functionality.

After important changes:

- build the project,
- run existing tests,
- manually verify the demo flow.

---

## 19. Do Not Refactor Without Reason

Do not refactor working code simply because another implementation appears
cleaner.

Refactoring is justified when it:

- fixes a real problem,
- removes a blocker,
- improves reliability,
- makes an upcoming critical feature significantly easier,
- or prevents likely failures.

During the hackathon:

working code > beautiful architecture.

---

# Hackathon Timeline Rules

## 20. Early Development

During the early phase:

Focus on proving technical feasibility.

Test the highest-risk parts first, such as:

- AI/model calls
- external APIs
- database connections
- file processing
- hardware communication
- video/image processing
- deployment

Do not spend several hours polishing UI before confirming the core technology
works.

---

## 21. First Demo Milestone

As soon as possible, create a complete minimal user flow.

The first demo does not need to look polished.

It must demonstrate:

input
→ core processing
→ output

Once the first complete demo works, create a Git checkpoint.

Example:

git tag demo-v1

Do not create this tag unless the corresponding commit is actually usable.

---

## 22. D3 Feature Freeze

After the D3 feature freeze:

DO NOT add major features unless absolutely necessary.

Focus on:

- fixing bugs,
- improving demo stability,
- improving the core user flow,
- improving presentation quality,
- polishing important UI,
- recording the demo video,
- README,
- deployment verification,
- presentation preparation,
- submission materials.

Avoid:

- framework migrations,
- architecture rewrites,
- database migrations without necessity,
- experimental dependencies,
- new large features.

---

## 23. Final Submission State

Before final submission:

1. Confirm the project builds.
2. Confirm the project starts correctly.
3. Test the entire demo flow.
4. Verify required APIs and services.
5. Verify environment configuration.
6. Verify README instructions.
7. Verify the repository is accessible to judges.
8. Confirm no secrets are committed.
9. Push all required commits.
10. Record the exact final commit used for submission.

Create a final tag when appropriate:

git tag submission-v1.0
git push origin submission-v1.0

The submitted version should correspond to a known-working commit.

---

# AI Agent Behavior

## 24. Codex Behavior

When working autonomously:

- inspect before editing,
- make focused changes,
- preserve working functionality,
- test important changes,
- report important failures,
- avoid unnecessary rewrites,
- avoid unnecessary dependencies,
- do not silently change architecture,
- do not silently remove features.

If uncertain between:

A. a complex technically elegant solution

and

B. a simple reliable solution

prefer B during the hackathon.

---

## 25. Final Principle

The goal is not to build the perfect long-term software system.

The goal is to build the strongest reliable demonstration possible within
48 hours.

Working demo > architecture purity.

Stable demo > additional features.

Clear user value > technical complexity.
