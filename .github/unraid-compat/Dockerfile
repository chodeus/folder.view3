# The PHP an Unraid version ships, plus Unraid's gawk (the remove script uses RT), xz (packages), procps (pages call pgrep)
# and wget (the installer's downloader, so a download fails on the network, not a missing tool)
ARG PHP
FROM php:${PHP}-cli
# Unraid's /bin/sh is bash: its exec() strings use &>
RUN apt-get update && apt-get install -y --no-install-recommends gawk procps wget xz-utils && rm -rf /var/lib/apt/lists/* \
	&& ln -sf bash /bin/sh
