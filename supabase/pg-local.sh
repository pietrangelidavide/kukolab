# Funzioni comuni per le prove su un PostgreSQL locale (senza Supabase). Si include con "source".
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
[ -x "${BIN:-}/initdb" ] || { echo "PostgreSQL non trovato (cerco in /usr/lib/postgresql/*/bin)"; exit 2; }
DIR=${PGTEST_DIR:-/tmp/kuko-pgtest}
PORT=${PGTEST_PORT:-54329}
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
pg_stop() { as_pg "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; }
# Avvia un database "kuko" nuovo con le finte parti di Supabase e lo schema.
pg_fresh() {
  pg_stop
  rm -rf "$DIR"; mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
  as_pg "$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
  as_pg "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1 -c fsync=off -c timezone=UTC" -l "$DIR/log" -w start >/dev/null
  PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
  "${PSQL[@]}" -c "create database kuko" >/dev/null
}
pg_file() { "${PSQL[@]}" -d kuko -f "$1"; }
