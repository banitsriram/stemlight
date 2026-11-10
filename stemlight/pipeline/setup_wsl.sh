#!/usr/bin/env bash
# One-time setup in WSL2 Ubuntu without sudo: cmake/ninja from pip --user, sfizz built from source in ~/sfizz.
# Usage: wsl -d Ubuntu -- bash -l /mnt/c/.../stemlight/pipeline/setup_wsl.sh
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
python3 -m pip install --user --break-system-packages -q cmake ninja numpy mido pyyaml
SFIZZ_TAG="${SFIZZ_TAG:-1.2.3}"
[ -d "$HOME/sfizz" ] || git clone --depth 1 --branch "$SFIZZ_TAG" --recursive --shallow-submodules https://github.com/sfztools/sfizz.git "$HOME/sfizz"
# Local patch: sfizz_render 1.2.3 always writes 16-bit PCM; quiet orchestral layers land near -40 dBFS and lose
# resolution before loudness normalising, so write 32-bit float WAV instead (same samples, no quantisation).
R="$HOME/sfizz/clients/sfizz_render.cpp"
if ! grep -q "DR_WAVE_FORMAT_IEEE_FLOAT" "$R"; then
  sed -i -e 's/outputFormat.format = DR_WAVE_FORMAT_PCM;/outputFormat.format = DR_WAVE_FORMAT_IEEE_FLOAT;/' \
         -e 's/outputFormat.bitsPerSample = 16;/outputFormat.bitsPerSample = 32;/' \
         -e '/drwav_f32_to_s16(interleavedPcm.data(), interleavedBuffer.data(), 2 \* blockSize);/d' \
         -e 's/drwav_write_pcm_frames(&outputFile, blockSize, interleavedPcm.data())/drwav_write_pcm_frames(\&outputFile, blockSize, interleavedBuffer.data())/' "$R"
fi
if [ ! -x "$HOME/sfizz/build/library/bin/sfizz_render" ] || [ "$R" -nt "$HOME/sfizz/build/library/bin/sfizz_render" ]; then
  cmake -S "$HOME/sfizz" -B "$HOME/sfizz/build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DSFIZZ_JACK=OFF -DSFIZZ_RENDER=ON -DSFIZZ_SHARED=OFF -DSFIZZ_USE_SNDFILE=OFF \
    -DPLUGIN_LV2=OFF -DPLUGIN_VST3=OFF -DPLUGIN_AU=OFF -DPLUGIN_PUREDATA=OFF -DSFIZZ_TESTS=OFF -DSFIZZ_DEMOS=OFF -DSFIZZ_BENCHMARKS=OFF -DSFIZZ_DEVTOOLS=OFF
  cmake --build "$HOME/sfizz/build" --target sfizz_render -j"$(nproc)"
fi
ls -la "$HOME/sfizz/build/library/bin/sfizz_render"
grep -n "IEEE_FLOAT\|interleavedBuffer.data())" "$R"
