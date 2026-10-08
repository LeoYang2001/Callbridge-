#!/bin/sh
#
# DOES EVERY PREBUILT FRAMEWORK MATCH THE MARKER THAT DESCRIBES IT?
#
# React Native and Expo both ship their heavy frameworks as prebuilt binaries
# with separate Debug and Release variants, and both decide whether to swap at
# build time by reading a marker file that records which variant is currently on
# disk. Neither of them checks. They trust the marker.
#
# `pod install` breaks that trust: it re-extracts the pod, which writes the
# RELEASE binary and leaves (or restores) a marker still claiming "debug". The
# swap script then reads "debug", concludes there is nothing to do, and a Debug
# build links a Release framework.
#
# That failure is silent and it is not survivable. Mixing a Debug React core
# with a Release ExpoModulesCore is an ABI mismatch on facebook::react::Props --
# the struct has different members in the two configurations -- so the app
# segfaults inside ExpoViewProps' constructor during startup, before any
# JavaScript runs, with a backtrace that points at React and Expo and says
# nothing about CocoaPods.
#
# This compares each framework's actual byte size against the two tarballs it
# was extracted from, and reports any marker that is lying. Run it after every
# `pod install`.
set -e
cd "$(dirname "$0")/../ios/Pods" 2>/dev/null || { echo "no ios/Pods -- run pod install first"; exit 0; }

bad=0

check() { # $1 = pod dir, $2 = artifacts dir, $3 = marker path, $4 = tarball prefix
  pod="$1"; art="$2"; marker="$3"; prefix="$4"
  bin="$pod/$pod.xcframework/ios-arm64_x86_64-simulator/$pod.framework/$pod"
  [ -f "$bin" ] || return 0
  onDisk=$(wc -c < "$bin" | tr -d ' ')
  actual=""
  for v in debug release; do
    t="$art/$prefix-$v.tar.gz"
    [ -f "$t" ] || continue
    s=$(tar -tvzf "$t" 2>/dev/null | grep -E "ios-arm64_x86_64-simulator/$pod\.framework/$pod\$" | awk '{print $5}')
    [ "$s" = "$onDisk" ] && actual="$v"
  done
  [ -n "$actual" ] || return 0
  claimed=$(cat "$marker" 2>/dev/null | tr 'A-Z' 'a-z')
  if [ "$claimed" != "$actual" ]; then
    echo "  MISMATCH  $pod: on disk is $actual, marker says '${claimed:-<missing>}'"
    printf '%s' "$actual" > "$marker"
    echo "            repaired -> $actual (the next build will swap in the right one)"
    bad=$((bad + 1))
  fi
}

for d in */artifacts; do
  p=$(dirname "$d")
  check "$p" "$d" "$d/.last_build_configuration" "$p"
done

# React core keeps its marker beside the framework rather than in artifacts/,
# and capitalises the value.
if [ -d React-Core-prebuilt ]; then
  bin="React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework/React"
  if [ -f "$bin" ]; then
    onDisk=$(wc -c < "$bin" | tr -d ' ')
    actual=""
    for v in debug release; do
      t=$(ls ReactNativeCore-artifacts/reactnative-core-*-$v.tar.gz 2>/dev/null | head -1)
      [ -n "$t" ] || continue
      s=$(tar -tvzf "$t" 2>/dev/null | grep -E "ios-arm64_x86_64-simulator/React\.framework/React\$" | awk '{print $5}')
      [ "$s" = "$onDisk" ] && actual="$v"
    done
    if [ -n "$actual" ]; then
      claimed=$(cat React-Core-prebuilt/.last_build_configuration 2>/dev/null | tr 'A-Z' 'a-z')
      if [ "$claimed" != "$actual" ]; then
        cap=$(printf '%s' "$actual" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
        echo "  MISMATCH  React core: on disk is $actual, marker says '${claimed:-<missing>}'"
        printf '%s' "$cap" > React-Core-prebuilt/.last_build_configuration
        echo "            repaired -> $cap"
        bad=$((bad + 1))
      fi
    fi
  fi
fi

if [ "$bad" -eq 0 ]; then
  echo "OK: every prebuilt framework matches its build-configuration marker"
else
  echo "Repaired $bad marker(s). Build again -- the swap phases will now run."
fi
