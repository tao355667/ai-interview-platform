"""Run two independent benchmark processes against one shared Redis quota."""
import argparse
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--binary", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--mode", choices=("rpm", "tpm"), default="rpm")
parser.add_argument("--rounds", type=int, default=6)
args = parser.parse_args()
binary = str(Path(args.binary).resolve())
output = Path(args.out).resolve()
output.mkdir(parents=True, exist_ok=True)
limit = 100 if args.mode == "rpm" else 5000
expected = 100 if args.mode == "rpm" else 50

for round_number in range(1, args.rounds + 1):
    gate = str(int(time.time() * 1000) + 1000)
    subject = f"bench-{args.mode}-{time.time_ns()}"
    processes = []
    for instance in (1, 2):
        result = output / f"{args.mode}-r{round_number}-instance{instance}.json"
        log = (output / f"{args.mode}-r{round_number}-instance{instance}.log").open("w")
        command = [binary, "-mode", args.mode, "-n", "1000", "-c", "50",
                   "-limit", str(limit), "-subject", subject, "-start-at", gate,
                   "-out", str(result)]
        processes.append((subprocess.Popen(command, stdout=log, stderr=log), result, log))
    samples = []
    for process, result, log in processes:
        code = process.wait()
        log.close()
        if code != 0:
            raise RuntimeError(f"benchmark failed; inspect {result}")
        samples.append(json.loads(result.read_text()))
    total = {key: sum(sample[key] for sample in samples)
             for key in ("allowed", "denied", "dependency_errors")}
    print(f"{args.mode} round {round_number}: {total}", flush=True)
    if total != {"allowed": expected, "denied": 2000 - expected, "dependency_errors": 0}:
        raise RuntimeError(f"shared quota violated: {total}")
