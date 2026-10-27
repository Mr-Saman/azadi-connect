#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
core_dir="$project_root/.cache/android-core/sing-box"
mkdir -p "$(dirname "$core_dir")" "$project_root/android/app/libs"
if [ ! -d "$core_dir/.git" ]; then
  git clone --depth 1 --branch v1.14.3 https://github.com/SagerNet/sing-box.git "$core_dir"
fi
test "$(git -C "$core_dir" rev-parse HEAD)" = 7054cac5124465ffdb145870d7c01885566711b1
git -C "$core_dir" diff --quiet
git -C "$core_dir" diff --cached --quiet
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to NDK 28.1.13356709}"
cd "$core_dir"
go install github.com/sagernet/gomobile/cmd/gomobile github.com/sagernet/gomobile/cmd/gobind
"$(go env GOPATH)/bin/gomobile" bind -target=android/arm64,android/amd64 -androidapi=26 -javapkg=io.nekohasekai -libname=box -trimpath -buildvcs=false -ldflags="-s -w -checklinkname=0 -X github.com/sagernet/sing-box/constant.Version=1.14.3" -tags=with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,with_openvpn,badlinkname -o "$project_root/android/app/libs/libbox.aar" ./experimental/libbox
sha256sum "$project_root/android/app/libs/libbox.aar"
