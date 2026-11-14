# The PHP an Unraid version ships, plus what Unraid has and this image lacks: gawk (the .plg's remove script uses RT), xz
# (the package format) and wget (the installer's downloader, so a download fails on the network, not a missing tool).
ARG PHP
FROM php:${PHP}-cli
RUN apt-get update && apt-get install -y --no-install-recommends gawk wget xz-utils && rm -rf /var/lib/apt/lists/*
