#!/usr/bin/env python3
"""Expose concise, fixture-only JUnit failures as normal GitHub annotations."""
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parents[1]
cases = []
for result in (root / "app/build/outputs/androidTest-results").rglob("TEST*.xml"):
    cases.extend(ET.parse(result).getroot().iter("testcase"))

def escape(value):
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")

failed = skipped = 0
for case in cases:
    if case.find("skipped") is not None:
        skipped += 1
    failures = list(case.findall("failure")) + list(case.findall("error"))
    for failure in failures:
        failed += 1
        title = case.get("classname", "") + "#" + case.get("name", "")
        message = (failure.get("message") or failure.text or "Device test failed")[:3500]
        print("::error title=Android device test::" + escape(title + "\n" + message))
print(f"Android device tests: {len(cases)} executed; {failed} failed; {skipped} skipped.")
if not cases:
    print("::error::Android device tests did not execute. Inspect the emulator step.")
if failed or skipped or not cases:
    sys.exit(1)
