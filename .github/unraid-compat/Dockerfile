# The PHP an Unraid version ships, plus what Unraid has and this image lacks: gawk (the .plg's remove script uses RT) and xz.
ARG PHP
FROM php:${PHP}-cli
RUN apt-get update && apt-get install -y --no-install-recommends gawk xz-utils && rm -rf /var/lib/apt/lists/*
