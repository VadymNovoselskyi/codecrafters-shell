#!/usr/bin/env python3
import json
import sys

with open("args.json", "w") as f:
    json.dump(sys.argv, f, indent=2)

print("done")
