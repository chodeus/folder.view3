# The PHP an Unraid version ships, plus what Unraid has and this image lacks: gawk (the .plg's remove script uses RT), xz
# (the package format), procps (Unraid's pages test for running services with pgrep) and wget (the installer's downloader,
# so a download fails on the network, not a missing tool). Unraid's /bin/sh is bash: its exec() strings use &>.
ARG PHP
FROM php:${PHP}-cli
RUN apt-get update && apt-get install -y --no-install-recommends gawk procps wget xz-utils && rm -rf /var/lib/apt/lists/* \
	&& ln -sf bash /bin/sh
