# 10.2 Automated Verification

## Test execution

Date: 22 October 2026  
Repository commit under test: `4a1fef4cb19e4fdc9571117afc29ee24f092d972`  
Python environment: virtual environment, Python 3.14.2  
AWS test configuration: dummy credentials and `eu-west-2`; no live AWS service call was required.

### Backend command

```powershell
$env:AWS_ACCESS_KEY_ID='testing'
$env:AWS_SECRET_ACCESS_KEY='testing'
$env:AWS_SESSION_TOKEN='testing'
$env:AWS_DEFAULT_REGION='eu-west-2'
& '.\.venv\Scripts\python.exe' -m pytest -q backend/tests
```

### Backend terminal output

```text
........................................................................ [ 74%]
.........................                                                [100%]
97 passed in 1.92s
```

Result: **97 backend tests passed; 0 failed.**

### Frontend command

```powershell
node --test tests/frontend-contract.test.mjs
```

### Frontend terminal output

```text
TAP version 13
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Result: **9 frontend contract tests passed; 0 failed.**

## Verification conclusion

The automated verification run completed successfully with:

```text
106 tests passed
0 tests failed
```

The earlier planned wording stated “97 backend and eight frontend contract tests”. The current repository contains nine frontend contract tests because the performance-evidence export contract was added. The accurate current statement is therefore **97 backend tests and 9 frontend contract tests, all passing**.
