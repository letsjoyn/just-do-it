# Just Do it.

**Focus better.**

A brutal, gamified focus timer and sleek analytics dashboard.

## Features

- Desktop blocking
- Hard math/QR unlocks
- Exact duration early termination tracking
- Cloud syncing
- Web dashboard with a GitHub contribution-style heatmap

## Architecture

```mermaid
flowchart LR
    A[Desktop App (Python)] -->|Sync Payload| B[(Firebase Firestore)]
    C[Web Dashboard (Vanilla JS)] -->|Pull Data| B
```
