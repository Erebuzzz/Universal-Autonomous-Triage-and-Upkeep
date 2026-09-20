# Build UATU

## Project Identity

**Name:** UATU  
**Full Form:** Universal Autonomous Triage & Upkeep

**Tagline:**  
**Observe. Understand. Repair. Contribute.**

**One-line description:**  
UATU is an autonomous open-source engineering and security research agent that analyzes authorized repositories, develops a persistent understanding of their codebases, investigates bugs and vulnerabilities, solves open issues, verifies its fixes, and creates reviewable GitHub pull requests.

---

# 1. Product Vision

Build UATU as a real agentic software engineering system, not a chatbot or static vulnerability scanner.

UATU should behave like an experienced open-source maintainer, contributor, and authorized security researcher operating under explicit permissions.

Given an authorized GitHub repository or organization, UATU should be able to:

1. Discover and understand the repository.
2. Build and maintain a persistent internal model of the repository.
3. Analyze source code, documentation, issues, PRs, dependencies, tests, and CI.
4. Identify actionable engineering and security problems.
5. Triage and prioritize those problems.
6. Investigate selected problems using repository-aware reasoning.
7. Reproduce bugs or security findings safely in an isolated environment when appropriate.
8. Design and implement a fix.
9. Add or update regression tests.
10. Run verification checks.
11. Learn from the result and update its internal knowledge.
12. Generate a clear explanation of the change.
13. Create a branch and commit the changes.
14. Open a GitHub pull request for human review.
15. Continue using accumulated knowledge in future tasks.

The core loop is:

```text
OBSERVE
   ↓
UNDERSTAND
   ↓
REMEMBER
   ↓
TRIAGE
   ↓
INVESTIGATE
   ↓
FIX
   ↓
VERIFY
   ↓
LEARN
   ↓
CONTRIBUTE
```

---

# 2. The UATU Brain

The central differentiating component of UATU is its **Brain / Memory Layer**.

Do not implement memory as merely a conversation-history database.

Build it as a **live, evolving neuron-like knowledge system** representing the repository, its behavior, prior investigations, known risks, fixes, and relationships.

Conceptually:

```text
                  ┌─────────────────────────┐
                  │       UATU BRAIN        │
                  │                         │
                  │  Live Neuron Knowledge  │
                  │        System           │
                  └────────────┬────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
      Repository          Experiences         Procedures
       Knowledge            / Memory            / Skills
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
                               ▼
                         Agent Reasoning
                               │
                               ▼
                            Action
                               │
                               ▼
                           New Evidence
                               │
                               └──────→ Brain Update
```

The brain should continuously evolve as UATU interacts with the repository.

---

# 3. Live Neuron Model

Represent important entities and concepts as **neurons/nodes**, with relationships behaving like synaptic connections.

Possible neurons:

```text
Repository
File
Directory
Function
Class
Module
Dependency
Issue
Pull Request
Commit
Test
CI Workflow
Configuration
Security Finding
Vulnerability
Bug
Feature
Developer/Contributor
Subsystem
Architecture Component
Tool
Agent Decision
Patch
Observation
Hypothesis
Verification Result
```

Connections can represent:

```text
CONTAINS
IMPORTS
CALLS
DEPENDS_ON
AFFECTS
RELATED_TO
DUPLICATES
FIXES
INTRODUCES
REGRESSES
VERIFIED_BY
TESTED_BY
CAUSED_BY
LOCATED_IN
MENTIONED_BY
DERIVED_FROM
```

Example:

```text
Issue #284
    │
    ├── AFFECTS → auth/service.py
    │
    ├── RELATED_TO → login()
    │
    ├── VERIFIED_BY → test_auth_failure()
    │
    └── FIXED_BY → Commit a81f32
                       │
                       └── VERIFIED_BY → CI Run #821
```

This should allow UATU to reason from relationships instead of repeatedly searching from scratch.

---

# 4. Memory Types

Use multiple forms of memory.

## 4.1 Working Memory

Short-lived state for the current task.

Contains:

- current objective
- current issue
- relevant files
- active hypotheses
- recent tool outputs
- pending actions
- verification state

Working memory should be disposable after the task unless promoted into long-term memory.

---

## 4.2 Episodic Memory

Record important experiences.

Examples:

```text
"Previous attempt to patch parser.py caused regression in parser tests."

"Reproduction requires configuration X."

"Dependency upgrade broke compatibility with API Y."

"Maintainer rejected approach Z because project supports Python 3.9."
```

This allows UATU to learn from its own history.

---

## 4.3 Semantic Memory

Facts about the repository.

Examples:

```text
auth/service.py handles token validation.

The project uses PostgreSQL.

The repository supports Node.js 20.

Function parseInput() receives user-controlled data.

Issue #421 and issue #437 concern the same subsystem.
```

Semantic memory should be reusable across tasks.

---

## 4.4 Procedural Memory

Store successful workflows and patterns.

Examples:

```text
For this repository:
run pytest before integration tests.

Security changes require updating security regression fixtures.

Frontend changes require npm test + npm build.

Database migrations must be applied before integration tests.
```

This becomes UATU's repository-specific "muscle memory."

---

## 4.5 Security Memory

Maintain a dedicated security knowledge layer.

Store:

- prior findings
- investigated vulnerabilities
- false positives
- vulnerable code patterns
- repository-specific trust boundaries
- security-sensitive components
- remediation patterns
- dependency incidents
- previously fixed vulnerabilities
- security regression tests

This prevents repeated rediscovery of already-understood weaknesses.

---

# 5. Synaptic Strength

Connections in the brain should have metadata such as:

```text
confidence
importance
recency
frequency
source
verification status
last observed
```

For example:

```text
auth/service.py
      │
      │  confidence: 0.94
      │  importance: 0.91
      │  last_verified: recent CI run
      ▼
authentication subsystem
```

Frequently confirmed relationships should become stronger.

Incorrect or obsolete relationships should weaken or be invalidated.

Conceptually:

```text
Repeated evidence
      ↓
stronger connection

Contradictory evidence
      ↓
uncertainty

No longer valid
      ↓
decay / archive
```

Do not implement this as fake biological simulation for the sake of aesthetics.

The neuron analogy should represent a real graph-based memory and evidence system.

---

# 6. Memory Lifecycle

Every agent action should be capable of producing new memory.

```text
Observation
   ↓
Interpretation
   ↓
Validation
   ↓
Memory Candidate
   ↓
Confidence Evaluation
   ↓
Memory Update
```

Only sufficiently supported information should become persistent knowledge.

For example:

```text
Agent believes:
"parseInput() may allow traversal."

Not immediately stored as fact.

       ↓

Reproduction succeeds.

       ↓

Store:
"parseInput() permits path traversal under condition X."

       ↓

Patch implemented.

       ↓

Regression test passes.

       ↓

Increase confidence.
```

---

# 7. Contradiction and Memory Management

Repositories evolve.

Therefore, UATU must assume that some memories become obsolete.

Example:

```text
Memory:
auth middleware uses JWT.

New commit:
authentication architecture migrated to OAuth.

        ↓

Detect contradiction
        ↓
Mark previous memory stale
        ↓
Investigate new architecture
        ↓
Update knowledge graph
```

Support statuses such as:

```text
ACTIVE
UNCERTAIN
STALE
CONTRADICTED
ARCHIVED
VERIFIED
```

Never blindly trust old memory over fresh repository evidence.

Fresh verified source evidence should generally outrank stale memories.

---

# 8. Memory Retrieval

Before performing a task, UATU should retrieve relevant previous knowledge.

Example:

User:

> Fix issue #284.

UATU should automatically retrieve:

```text
Issue #284
+
affected files
+
related previous issues
+
previous failed attempts
+
relevant architectural knowledge
+
existing tests
+
past security findings
+
repository-specific testing procedure
```

This should significantly reduce repeated investigation.

---

# 9. Memory Consolidation

After completing tasks, run a consolidation stage.

```text
Current Task Experiences
        ↓
Extract durable knowledge
        ↓
Deduplicate
        ↓
Resolve contradictions
        ↓
Update graph
        ↓
Strengthen verified relationships
        ↓
Decay obsolete information
```

This is analogous to a long-term learning/consolidation phase.

Do not store every tool call forever.

Store **knowledge**, not noise.

---

# 10. Brain Architecture

A practical implementation can combine:

### Graph Memory

For relationships between:

- code
- issues
- PRs
- commits
- dependencies
- vulnerabilities
- tests
- architectural components

### Vector Memory

For semantic retrieval of:

- issue discussions
- documentation
- code summaries
- previous investigations
- patches
- security reports

### Structured Memory

For deterministic information:

```text
repository metadata
task status
permissions
test results
CI status
dependency versions
confidence
timestamps
```

### Event Memory

Record significant changes:

```text
commit pushed
issue opened
PR merged
dependency changed
CI failed
security advisory published
```

The brain should unify these sources into one coherent knowledge layer.

---

# 11. Live Neuron Updates

The brain should be event-driven.

For example:

```text
GitHub Commit
      ↓
Event ingestion
      ↓
Affected files detected
      ↓
Relevant neurons activated
      ↓
Impact analysis
      ↓
Memory updated
```

Likewise:

```text
New Issue
    ↓
Issue neuron created
    ↓
Related code neurons activated
    ↓
Related issue neurons retrieved
    ↓
Triage initiated
```

And:

```text
New security advisory
    ↓
Dependency neurons activated
    ↓
Affected repository components identified
    ↓
Potential impact calculated
    ↓
Security workflow triggered
```

---

# 12. Neural Activation / Relevance

Implement a relevance mechanism for retrieving relevant knowledge.

A task should activate nearby concepts based on:

- semantic similarity
- graph connectivity
- recency
- confidence
- importance
- historical relevance
- task type

For example:

```text
Issue #284
   ↓
auth/service.py
   ↓
validateToken()
   ↓
authentication subsystem
   ↓
security finding #71
   ↓
PR #442
   ↓
regression test auth_edge_cases.py
```

This creates contextual reasoning across repository history.

---

# 13. Brain Visualization

Create an optional **Neural Repository Map** in the UI.

Show:

```text
               Repository
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Backend     Frontend     CI/CD
        │
     ┌──┴───┐
     ▼      ▼
   Auth   Database
    │
    ▼
Security Finding
    │
    ▼
   Patch
    │
    ▼
 Regression Test
```

Allow users to inspect:

- neurons
- relationships
- confidence
- evidence
- last update
- linked commits
- linked issues
- linked PRs

The visualization is not merely decoration.

It should be an interface into the agent's accumulated knowledge.

---

# 14. Forgetting and Memory Decay

The brain should support controlled forgetting.

Information should decay based on:

- age
- lack of confirmation
- repository changes
- contradictions
- low confidence

However, security-critical information should not simply disappear.

Archive it and preserve provenance.

Example:

```text
Old vulnerability
      ↓
Fixed
      ↓
Mark:
RESOLVED / HISTORICAL
      ↓
Retain for regression intelligence
```

Historical vulnerabilities can become valuable knowledge for detecting similar future patterns.

---

# 15. Learning From Failures

A major requirement is that UATU should learn from failed attempts.

Example:

```text
Attempt #1
Patch caused test failure
       ↓
Analyze failure
       ↓
Identify incorrect assumption
       ↓
Store lesson
       ↓
Attempt #2
Use updated knowledge
       ↓
Successful verification
```

The system should distinguish:

### Failed execution

Something technically failed.

### Failed reasoning

The agent's assumption was wrong.

### Failed strategy

The approach itself was inappropriate.

These should produce different memory entries.

---

# 16. Learning From Pull Requests

Once UATU opens a PR, future repository events can update its brain.

For example:

```text
PR opened
   ↓
Maintainer review
   ↓
Requested changes
   ↓
UATU learns:
"Repository prefers X over Y."
```

A merged PR can become a highly valuable memory:

```text
Problem
   ↓
UATU solution
   ↓
Human review
   ↓
Accepted solution
   ↓
High-confidence procedural knowledge
```

A rejected PR should also be useful.

Do not treat rejection as failure without learning from the reason.

---

# 17. Maintainer Preference Memory

Where explicit evidence exists, UATU can learn repository-specific preferences.

Examples:

- preferred naming conventions
- testing patterns
- commit style
- error-handling style
- architectural boundaries
- dependency policies
- acceptable abstraction level
- preferred libraries
- review expectations

Never infer sensitive characteristics about individual maintainers.

Focus on repository-level engineering preferences evidenced by the codebase and review history.

---

# 18. Core Agent Architecture

Build UATU around a supervisor + specialized agents architecture.

## Supervisor Agent

Responsible for:

- task decomposition
- workflow orchestration
- choosing specialized agents
- memory retrieval
- policy enforcement
- state management
- deciding when human input is required
- triggering memory consolidation

---

## Repository Research Agent

Responsibilities:

- map repository architecture
- identify frameworks/languages
- inspect entry points
- identify important subsystems
- inspect configuration
- inspect CI/CD
- inspect tests
- understand dependency graph
- create/update repository knowledge

---

## Issue Triage Agent

Responsibilities:

- read issues
- classify issues
- search code related to issue
- identify duplicates
- estimate reproducibility
- prioritize issues

---

## Bug Investigation Agent

Responsibilities:

- locate relevant code
- formulate hypotheses
- create minimal reproduction
- inspect runtime behavior
- identify root cause
- propose fix

---

## Security Research Agent

Responsibilities:

- identify suspicious patterns
- reason about trust boundaries
- inspect security-sensitive code paths
- analyze dependencies
- validate potential vulnerabilities
- build safe repository-local reproductions
- distinguish real findings from false positives

---

## Implementation Agent

Responsibilities:

- edit code
- maintain repository conventions
- minimize unnecessary changes
- preserve backwards compatibility where possible
- add tests
- update documentation where required

---

## Verification Agent

Responsibilities:

- run tests
- run lint
- run type checks
- run builds
- run security tooling
- inspect changed files
- compare behavior before/after
- validate regression tests

---

## PR Agent

Responsibilities:

- create branch
- generate meaningful commit
- generate PR title
- generate PR description
- summarize root cause
- describe implementation
- list tests
- include security impact when relevant
- link source issue

---

## Memory Agent

Create a dedicated memory subsystem responsible for:

- deciding what should be remembered
- extracting durable facts
- updating graph relationships
- storing experiences
- strengthening validated connections
- detecting contradictions
- marking stale knowledge
- consolidating task history
- retrieving context before agent actions

Memory should not be an unstructured dump of previous conversations.

---

# 19. Repository Knowledge System

UATU must build a structured knowledge representation of the repository.

Capture:

```text
Repository
 ├── languages
 ├── frameworks
 ├── services
 ├── architecture
 ├── dependencies
 ├── source files
 ├── symbols
 ├── tests
 ├── CI workflows
 ├── configuration
 ├── documentation
 ├── issues
 ├── pull requests
 ├── commits
 ├── security signals
 └── historical agent knowledge
```

Use semantic retrieval where useful.

Index:

- source metadata
- file summaries
- symbols
- documentation
- issues
- PRs
- commit summaries
- dependency metadata
- security findings
- agent-generated evidence
- historical task outcomes

Do not blindly embed the entire repository and call it intelligence.

Use hierarchical retrieval and targeted context assembly.

---

# 20. Tooling

Build a tool layer around UATU.

## GitHub

- repository metadata
- clone
- branch creation
- file read/write
- commit
- issue search
- issue creation/comment where authorized
- PR creation
- PR inspection
- commit history
- review information
- webhook/event handling

## Repository Analysis

- tree inspection
- symbol extraction
- static analysis
- dependency analysis
- test execution
- lint
- formatting
- type checking
- build

## Security

Use appropriate repository-local and open-source security tooling where practical.

Examples:

- Semgrep
- CodeQL-compatible workflows where available
- Trivy
- OSV-based dependency checks
- language-specific package auditing
- secret scanning
- custom AST-based rules

Tool choice should be language-aware.

---

# 21. Agent State Machine

Model every task explicitly.

```text
DISCOVERED
    ↓
TRIAGED
    ↓
SELECTED
    ↓
MEMORY_CONTEXT_LOADED
    ↓
INVESTIGATING
    ↓
VERIFIED
    ↓
IMPLEMENTING
    ↓
TESTING
    ↓
MEMORY_UPDATED
    ↓
REVIEWING
    ↓
READY_FOR_PR
    ↓
PR_CREATED
```

Failure states:

```text
BLOCKED
NEEDS_HUMAN
VERIFICATION_FAILED
LOW_CONFIDENCE
OUT_OF_SCOPE
MEMORY_CONFLICT
```

The system must never hide a failure by pretending the task succeeded.

---

# 22. Confidence Model

Every important agent decision should have confidence metadata.

Example:

```text
Finding confidence:       92%
Reproduction confidence:  87%
Patch confidence:         91%
Verification confidence: 96%
Memory confidence:        94%
```

These should be treated as transparent agent confidence indicators, not objective probabilities unless properly calibrated.

Memory confidence must also depend on evidence provenance.

---

# 23. Patch Quality Requirements

Every autonomous patch should aim for:

- minimal diff
- repository-consistent style
- no unrelated refactoring
- regression coverage
- deterministic tests where possible
- clear commit message
- reproducible verification
- clear explanation of trade-offs

Before opening a PR:

```text
[ ] Tests pass
[ ] Build passes
[ ] Lint passes where applicable
[ ] Type checks pass where applicable
[ ] Security checks pass where applicable
[ ] Diff reviewed
[ ] No unrelated changes
[ ] Issue linked
[ ] Memory updated
[ ] PR description generated
```

---

# 24. Permission and Safety Model

Default state:

### PASSIVE MODE

Allowed:

- clone repository
- inspect source
- inspect documentation
- inspect issues and PRs
- analyze dependencies
- run local/static analysis
- run tests
- analyze public security advisories
- create internal reports
- generate proposed patches locally

Not allowed:

- active testing against external systems
- exploitation of unrelated targets
- brute force
- destructive testing
- network attacks
- credential attacks
- automated interaction with infrastructure outside declared scope
- opening PRs without explicit repository authorization

---

## Authorized Repository Mode

Before modifying a repository or opening a PR, require explicit authorization.

```text
TARGET
github.com/<org>/<repo>

AUTHORIZATION
✓ Repository is owned by me or I am authorized to contribute
✓ UATU may inspect repository contents
✓ UATU may create branches and commits
✓ UATU may open pull requests

SECURITY SCOPE
✓ Repository-local analysis
✓ Local reproduction
✓ Dependency analysis
✓ Test execution

[Activate Authorized Mode]
```

Do not infer authorization merely because a repository is public.

---

# 25. Operating Modes

## RESEARCH

Read-only repository intelligence.

## TRIAGE

Issue investigation and prioritization.

## MAINTAIN

Engineering issue → implementation → PR.

## SECURITY

Authorized repository-local security research.

## REMEDIATE

Validated finding → patch → regression coverage → security PR.

## WATCH

Event-driven continuous repository monitoring.

---

# 26. AWS Architecture

Design the system so it can run locally and optionally deploy to AWS.

## Local / Build It

Primary tooling:

- Strands Agents SDK
- local repository execution
- local model/tool configuration
- OpenSearch where useful
- SAM CLI / LocalStack where appropriate

The local version should not require an AWS account.

---

## Ship It

Suggested architecture:

```text
                    GitHub
                      │
                      ▼
                API Gateway
                      │
                      ▼
                   Lambda
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
       SQS Jobs             Repository Metadata
          │                       │
          ▼                       ▼
   Agent Orchestrator          DynamoDB
          │
          ▼
    Step Functions
          │
     ┌────┼───────────┐
     │    │           │
     ▼    ▼           ▼
 Research Security Implementation
     │    │           │
     └────┼───────────┘
          ▼
      Verification
          │
          ▼
          S3
          │
          ▼
      OpenSearch
          │
          ▼
       Web UI
```

Use AWS where it genuinely contributes value.

Useful services:

- Lambda
- Step Functions
- S3
- DynamoDB
- OpenSearch
- SQS
- EventBridge
- CloudWatch
- SageMaker AI where appropriate

Do not force every service into the application.

---

# 27. Event-Driven Brain

The memory system should be tightly integrated with event ingestion.

Example:

```text
GitHub Commit
      ↓
EventBridge / webhook
      ↓
Event processor
      ↓
Affected neurons detected
      ↓
Relevant memory activated
      ↓
Impact analysis
      ↓
Brain updated
```

For issues:

```text
New Issue
    ↓
Issue neuron
    ↓
Related code neurons
    ↓
Historical issue neurons
    ↓
Security neurons
    ↓
Triage
```

For dependencies:

```text
Dependency update
       ↓
Dependency neuron activated
       ↓
Affected components
       ↓
Historical vulnerabilities
       ↓
Compatibility memory
       ↓
Impact analysis
```

---

# 28. Security of UATU Itself

Treat UATU as security-sensitive infrastructure.

Implement:

- credential isolation
- secret management
- scoped GitHub tokens
- short-lived credentials where possible
- sandboxed repository execution
- network restrictions
- resource limits
- command allowlists where appropriate
- audit logs
- explicit user authorization
- separation between analysis and contribution permissions

The agent must not expose repository secrets in:

- logs
- prompts
- PRs
- reports
- UI
- model output
- persistent memory

Sensitive values should never become memory neurons.

---

# 29. Sandbox Execution

All repository execution should occur in an isolated environment.

Support:

- dependency installation
- unit tests
- builds
- static analysis
- local reproduction
- patch verification

Apply:

- CPU limits
- memory limits
- timeout limits
- filesystem isolation
- network policy
- process isolation

Do not execute arbitrary repository code directly on the host machine.

---

# 30. MVP

Prioritize a complete vertical slice.

### MVP workflow

User selects an authorized GitHub repository.

UATU:

1. clones repository
2. analyzes structure
3. constructs initial brain
4. imports issues
5. analyzes code and tests
6. identifies actionable issues
7. retrieves relevant memory
8. lets user select one
9. investigates it
10. implements a fix
11. generates a regression test
12. runs tests
13. updates memory with the experience
14. creates a branch
15. commits changes
16. opens a PR
17. displays the full audit trail and updated neural knowledge

Then add security remediation as the second vertical slice.

### Security MVP

1. analyze dependencies and source
2. construct relevant security knowledge graph
3. detect candidate vulnerability
4. explain evidence
5. validate safely
6. create patch
7. add regression test
8. verify
9. update security memory
10. open security remediation PR

---

# 31. Neural Repository Map

Create a visually compelling dashboard representing the repository as a living knowledge network.

Example:

```text
                         ┌──────────────┐
                         │  Repository  │
                         └──────┬───────┘
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
        ┌─────────┐        ┌─────────┐        ┌─────────┐
        │ Backend │        │Frontend │        │  CI/CD  │
        └────┬────┘        └─────────┘        └─────────┘
             │
      ┌──────┼──────┐
      ▼      ▼      ▼
    Auth    API   Database
      │
      ▼
 Security Finding
      │
      ▼
    Patch
      │
      ▼
 Regression Test
```

Show activity as live graph updates.

Example:

```text
Scanning...
     ↓
Neuron activated: auth/service.py
     ↓
Neuron activated: validateToken()
     ↓
Related memory found: security finding #71
     ↓
New evidence discovered
     ↓
Connection strengthened
     ↓
Patch candidate generated
```

This becomes one of the signature visual elements of UATU.

---

# 32. Demo Repository Strategy

For the hackathon demonstration, select a genuine open-source repository where:

- issues are public
- code is understandable
- tests exist
- realistic maintenance problems exist
- changes can be safely demonstrated
- authorization is explicit

Do not manufacture fake vulnerabilities just to make the demo work.

Do not attack third-party infrastructure.

Prefer repository-local analysis and controlled reproduction.

---

# 33. Repository Discovery

Eventually support:

```text
Find suitable repositories
        ↓
Analyze project health
        ↓
Build initial repository brain
        ↓
Identify contribution opportunities
        ↓
Suggest issues or security research targets
```

Discovery must remain passive until the user explicitly selects a repository and grants scope.

---

# 34. Demo Flow

Design the product around a compelling 3-minute demonstration.

### 0:00 - Problem

Show a real open-source repository.

### 0:20 - UATU Research

```text
Repository mapped
Issues indexed
Code analyzed
Dependencies analyzed
Brain initialized
```

### 0:45 - Intelligence

Show the neural knowledge graph activating relevant areas.

### 1:00 - Investigation

UATU selects a real issue and finds its root cause.

### 1:20 - Repair

Agent edits code and creates regression tests.

### 1:40 - Verification

```text
Tests: PASS
Build: PASS
Lint: PASS
Security checks: PASS
Regression test: PASS
```

### 2:00 - Memory update

Show:

```text
New experience stored
Repository architecture updated
Fix pattern learned
Previous hypothesis invalidated/strengthened
```

### 2:10 - Pull Request

Open the actual GitHub PR.

### 2:25 - Security workflow

Demonstrate a validated security finding and remediation PR.

### 2:45 - AWS

Briefly show how AWS supports:

- event ingestion
- agent orchestration
- storage
- search
- memory
- observability

### 2:55 - Closing

# UATU

**Universal Autonomous Triage & Upkeep**

**Observe. Understand. Repair. Contribute.**

---

# 35. Long-Term Vision

UATU should evolve into a continuously learning OSS engineering platform.

## Continuous Maintenance

- monitor repositories
- detect regressions
- identify dependency changes
- detect CI failures
- create maintenance PRs
- learn from merged/rejected changes

## Security Intelligence

- correlate advisories
- detect recurring vulnerability patterns
- identify affected code paths
- maintain historical security memory
- produce remediation PRs

## Contribution Intelligence

- discover useful issues
- identify suitable contribution opportunities
- explain unfamiliar repositories
- prepare implementation plans

## Automated Review

- review incoming PRs
- detect bugs
- detect security regressions
- suggest tests
- reason using historical repository memory

## Multi-Repository Brain

For authorized organizations, build a broader organizational knowledge layer:

```text
Organization
   │
   ├── Repository A
   ├── Repository B
   ├── Repository C
   └── Shared Dependencies
```

Allow reusable organizational engineering knowledge without leaking repository-specific secrets or unauthorized information across boundaries.

---

# 36. Engineering Standards

Write production-quality code.

Requirements:

- typed interfaces
- clear module boundaries
- structured logging
- error handling
- bounded retries
- idempotent workflows
- configuration via environment variables
- tests for critical components
- deterministic state transitions
- explicit policy enforcement
- versioned memory schema
- migration strategy for brain data

Do not build a giant monolithic agent.

Separate:

```text
UI
Policy
Orchestration
Agents
Tools
Repository Sandbox
Brain / Memory
Storage
Event Processing
AWS Infrastructure
```

---

# 37. Observability

Track:

- task ID
- repository
- workflow state
- active neurons
- retrieved memories
- tool calls
- execution duration
- failures
- test results
- patch metadata
- PR metadata
- confidence
- memory updates
- human approvals
- policy violations

Do not log secrets or unnecessary source contents.

---

# 38. Failure Handling

### Tests fail

Do not claim success.

```text
VERIFICATION_FAILED
```

### Agent cannot reproduce issue

```text
NEEDS_HUMAN
```

### Finding confidence is low

Do not automatically patch.

```text
SUSPECTED FINDING
```

### Repository authorization is missing

Remain in passive mode.

### Memory conflict occurs

```text
MEMORY_CONFLICT
```

Retrieve fresh repository evidence and resolve the contradiction before acting.

### Tool failure

Retry within bounded policy.

Never loop indefinitely.

---

# 39. Core Success Criteria

The MVP is successful when UATU can:

## Repository intelligence

- [ ] understand repository structure
- [ ] build a live repository brain
- [ ] index issues and documentation
- [ ] identify relevant source files
- [ ] analyze dependencies
- [ ] inspect tests and CI

## Engineering

- [ ] select an issue
- [ ] retrieve relevant prior memory
- [ ] investigate it
- [ ] reproduce it
- [ ] identify root cause
- [ ] implement a fix
- [ ] add regression coverage
- [ ] verify the change
- [ ] update memory
- [ ] create a branch
- [ ] commit
- [ ] open a PR

## Security

- [ ] detect candidate security findings
- [ ] provide evidence
- [ ] distinguish suspicion from validation
- [ ] safely reproduce authorized findings
- [ ] implement remediation
- [ ] add regression coverage
- [ ] verify
- [ ] update security memory
- [ ] create a security remediation PR

## Brain

- [ ] maintain repository knowledge graph
- [ ] support semantic retrieval
- [ ] maintain episodic memory
- [ ] maintain procedural memory
- [ ] track confidence
- [ ] detect stale information
- [ ] detect contradictions
- [ ] strengthen verified relationships
- [ ] learn from failed attempts
- [ ] learn from PR reviews
- [ ] consolidate long-term knowledge

## Safety

- [ ] enforce repository scope
- [ ] require explicit authorization
- [ ] sandbox repository execution
- [ ] prevent unauthorized active testing
- [ ] protect secrets
- [ ] maintain audit logs
- [ ] prevent sensitive information from entering persistent memory

## AWS

- [ ] support local-first development
- [ ] provide an AWS deployment path
- [ ] use AWS services meaningfully
- [ ] expose observable agent workflows
- [ ] support event-driven execution

---

# 40. Build Philosophy

Do not build UATU as:

> "ChatGPT for GitHub."

Do not build it as:

> "A vulnerability scanner with an LLM."

Do not build it as:

> "A chatbot with vector memory."

Build it as:

> **An autonomous software engineering and security system with a persistent, evidence-driven brain.**

The agent should:

**read code → remember context → reason about code → operate tools → modify code → run tests → verify results → learn → contribute changes.**

The brain should:

**observe → connect → remember → reinforce → question → update → forget obsolete knowledge.**

The central product loop is:

```text
                    ┌──────────────┐
                    │   OBSERVE    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  UNDERSTAND  │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   REMEMBER   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    TRIAGE    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ INVESTIGATE  │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │     FIX      │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   VERIFY     │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    LEARN     │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  CONTRIBUTE  │
                    └──────┬───────┘
                           │
                           └──────→ GitHub PR
```

Build the smallest system that can complete this loop end-to-end.

Then make the **brain progressively better at predicting where to look, remembering what happened, avoiding previously failed approaches, understanding repository conventions, and selecting the next useful action.**

Do not sacrifice reliability for the illusion of autonomy.

**UATU should produce changes that a human maintainer would actually want to review, while becoming more knowledgeable about the repository every time it works on it.**