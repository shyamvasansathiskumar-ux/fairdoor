"""FairDoor simulation: deadline rush + script flood. No limiter vs per-IP limiting vs FairDoor (per-identity fair queue + arrival stamps).
1-second ticks. Server serves CAP requests/s. Deadline at t=600.
300 students; 220 sit behind 2 hostel NAT IPs, 80 on unique IPs.
Each student submits once at a time skewed toward the deadline; if not served within TIMEOUT s, retries after RETRY s.
Attacker: one student identity flooding RATE req/s from 20 IPs from t=300.
"""
import random, collections, statistics

def run(policy, seed=1, CAP=4, RATE=60, TIMEOUT=20, RETRY=5, DEADLINE=600):
    rnd = random.Random(seed)
    N = 300
    ip = {i: ("hostelA" if i < 110 else "hostelB" if i < 220 else f"ip{i}") for i in range(N)}
    # arrivals skewed late: 60% in last 120 s
    arrive = {i: (DEADLINE - rnd.expovariate(1/90)) for i in range(N)}
    arrive = {i: max(0, int(t)) for i, t in arrive.items()}
    pending = collections.defaultdict(list)   # tick -> students starting a request
    for i, t in arrive.items(): pending[t].append(i)
    queue = collections.deque()               # (enqueue_time, ident, ip, is_attack)
    served_ok, stamped = set(), {}
    attack_served = legit_served = 0
    bucket = collections.defaultdict(lambda: 1.0)  # per-IP token bucket, 1 req/s, burst 1
    drr = collections.OrderedDict()           # ident -> deque of requests (FairDoor)
    for t in range(0, DEADLINE + 1):
        new = []
        for i in pending.pop(t, []):
            if i not in served_ok: new.append((t, i, ip[i], False))
        if t >= 300:
            for k in range(RATE): new.append((t, "ATTACKER", f"bot{k%20}", True))
        if policy == "per_ip":
            for b in bucket: bucket[b] = min(1.0, bucket[b] + 1.0)
        for r in new:
            if policy == "per_ip":
                if bucket[r[2]] >= 1: bucket[r[2]] -= 1; queue.append(r)
                elif not r[3]: pending[t + RETRY].append(r[1])   # 429 -> student retries
            elif policy == "fairdoor":
                ident = r[1]
                if not r[3] and ident not in stamped: stamped[ident] = t   # signed arrival stamp, cheap
                q = drr.setdefault(ident, collections.deque())
                if len(q) < 1: q.append(r)       # one in-flight request per identity
            else:
                queue.append(r)
        # serve
        for _ in range(CAP):
            if policy == "fairdoor":
                if not drr: break
                ident, q = drr.popitem(last=False)
                r = q.popleft()
                if q: drr[ident] = q
            else:
                while queue and t - queue[0][0] > TIMEOUT:
                    old = queue.popleft()
                    if not old[3]: pending[t + RETRY].append(old[1])
                if not queue: break
                r = queue.popleft()
            if r[3]: attack_served += 1
            else: legit_served += 1; served_ok.add(r[1])
    if policy == "fairdoor":
        # deadline judged on arrival stamp; remaining legit queue drains after deadline
        made_it = len(stamped); backlog = len(stamped) - len(served_ok)
    else:
        made_it = len(served_ok)
    total = attack_served + legit_served
    return dict(policy=policy, backlog=(backlog if policy=="fairdoor" else 0), legit_ok=made_it, legit_missed=N - made_it,
                attacker_share=round(attack_served / max(total, 1), 3))

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Compare no limiter, per-IP limiting and FairDoor.")
    ap.add_argument("--no-attacker", action="store_true", help="deadline rush only, no flood")
    ap.add_argument("--runs", type=int, default=10, help="random seeds to average over")
    a = ap.parse_args()
    rate = 0 if a.no_attacker else 60
    print(f"{'policy':<10} {'missed deadline (mean)':>24} {'attacker share of capacity':>28}")
    for p in ["none", "per_ip", "fairdoor"]:
        res = [run(p, seed=s, RATE=rate) for s in range(a.runs)]
        print(f"{p:<10} {statistics.mean(r['legit_missed'] for r in res):>24} "
              f"{round(statistics.mean(r['attacker_share'] for r in res), 3):>28}")
