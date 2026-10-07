# FairDoor

**Rate limiting that can tell a deadline rush from a script flood.**

At 11:58 pm on a submission deadline, two things look the same to a server: hundreds of real students hitting *submit*, and one script hammering the endpoint. The usual defence, rate limiting per IP address, gets both wrong on a college network:

- **It punishes the innocent.** Hostels and campuses sit behind a few shared public IPs (NAT). 110 students on one IP look like one very busy client, so they get throttled together.
- **It misses the attacker.** A script spread across 20 IPs gets 20 times the budget.

FairDoor is a design for the submission path of academic web forms (assignment portals, exam registration, fee and scholarship forms). This repo holds the design and a simulation that tests it. It is not a production system yet.

## The idea

Three parts. None is new on its own; the combination, aimed at deadlines, is the point.

1. **Count per student, not per IP.** Requests are queued by authenticated identity and served round-robin (deficit round robin, Shreedhar & Varghese, 1995). Each student gets one request in flight. A flooder with one account gets one slot per round, the same as everyone else, however many IPs it uses.
2. **Judge the deadline on arrival, not on service.** When the server is saturated, it doesn't drop a student's request. It returns a signed **arrival stamp**:

   ```
   stamp = HMAC(server_key, student_id ‖ arrival_time ‖ SHA-256(submission))
   ```

   The student's browser resubmits later with the stamp. The server accepts the submission as on time if the stamp verifies and the submission still hashes to the value inside it. So the deadline is judged on when the student *arrived*, and binding the hash means they can't keep editing the answer after the deadline.
3. **Explainable flags.** Every throttle decision is recorded with a reason ("identity over fair share", "stamp replayed") so an administrator can answer a complaint from a student with evidence instead of guessing.

## Simulation

`sim.py` uses 1-second ticks with a 10-minute window. 300 students: 220 behind two hostel NAT IPs, 80 on their own. Arrivals are skewed towards the deadline, the server handles 4 requests per second, and a student whose request times out retries. The attacker floods 60 requests per second from 20 IPs under one identity, starting halfway through.

```bash
python3 sim.py                 # with the flood
python3 sim.py --no-attacker   # deadline rush only
```

Mean of 10 runs:

| Policy | Students who missed the deadline, with flood | ...with no attacker |
|---|---|---|
| No limiter | 60.4 | 0.3 |
| Per-IP token bucket (1 req/s) | 68.4 | 19.3 |
| FairDoor | 0 | 0 |

Two results matter. Per-IP limiting is *worse than nothing* under attack, because it throttles the hostel IPs harder than the flood. And with **no attacker at all**, it still made about 19 students miss, purely because they share an IP.

Under FairDoor the attacker still gets about 49% of capacity. That's by design: round-robin is work-conserving, so when few students are waiting, spare capacity goes to whoever asks. The flood can use idle capacity but can't take a student's turn.

## What the simulation does not show (yet)

This is a model, so the numbers depend on its assumptions. In particular:

- **One attacker identity.** FairDoor's fairness is only as strong as identity. An attacker with 50 stolen or fake student accounts gets 50 shares. Real deployments need account-level controls (SSO, enrolment-linked accounts) underneath it.
- **Stamps are free here.** In reality, issuing and verifying a stamp costs CPU, and a flood of stamp requests is its own load. Stamp issuance needs a cheap path and its own limit.
- **No network latency, no server crashes, one endpoint.**
- **The arrival curve is assumed** (exponential, skewed late). Real portal logs would replace it.

## Prior art

- RainCheck Filter: Y.-H. Kung, T. Lee, P.-N. Tseng, H.-C. Hsiao et al., [*"A Practical System for Guaranteed Access in the Presence of DDoS Attacks and Flash Crowds"*](https://www.csie.ntu.edu.tw/~hchsiao/pub/2015_IEEE_ICNP.pdf), IEEE ICNP 2015. Clients that get turned away receive timestamped "rain checks". FairDoor's arrival stamp is a descendant, with the submission hash added and the deadline semantics.
- [Fair-Drop](https://github.com/ratneshdagli/Fair-Drop): fair dropping under load.
- [Cloudflare Waiting Room](https://developers.cloudflare.com/waiting-room/reference/queueing-methods/): FIFO and random queueing for traffic peaks.
- Deficit Round Robin: M. Shreedhar and G. Varghese, SIGCOMM 1995.

## Next

- [ ] A minimal Flask implementation of the stamp issue/verify path, with tests
- [ ] Multi-identity attacker in the simulation
- [ ] Load test against the Flask version
- [ ] Threat model (stamp forgery, replay, clock skew)

## Licence

MIT
