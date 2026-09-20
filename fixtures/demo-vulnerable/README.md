# demo-vulnerable

Authorized UATU demo fixture. Contains:

1. A functional bug in `src/range.js` (`inclusiveRange` excludes the end bound).
2. A deliberately outdated `left-pad@1.0.1` dependency for the **fixture** security remediation slice.
3. A known-vulnerable `minimist@0.0.8` pin so **general** mode (`npm audit`) surfaces a real advisory without removing the left-pad fixture detector.

UATU may only write here after an explicit local authorization grant.
