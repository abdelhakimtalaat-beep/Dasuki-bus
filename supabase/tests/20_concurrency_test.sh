#!/usr/bin/env bash
# اختبار الحجوزات المتزامنة: عشرات العملاء يحجزون في نفس اللحظة من اتصالات منفصلة.
# يثبت أن السعة لا تُتجاوز أبدًا حتى تحت الضغط.
set -euo pipefail
DB="${1:-dasuki_test}"
Q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

setup_trip() {  # $1 = عدد المقاعد المحجوزة مسبقًا
  local trip
  trip=$(Q "insert into public.trips (trip_date, departure_time, departure_point, booking_opens_at, booking_closes_at, max_seats_per_booking)
            values (current_date + 30, '06:00', 'اختبار التزامن', now() - interval '1 hour', now() + interval '1 day', 10) returning id" | head -1)
  Q "insert into public.trip_pickup_points select '$trip', id from public.pickup_points where name = 'الشروق'" >/dev/null
  if [ "$1" -gt 0 ]; then
    Q "insert into public.bookings (trip_id, full_name, seats, pickup_point_id)
       select '$trip', 'حجز مسبق', $1, id from public.pickup_points where name = 'الشروق'" >/dev/null
  fi
  echo "$trip"
}

book() {  # $1 trip, $2 seats, $3 log, $4 client number (اسم وهاتف مختلف لكل عميل)
  psql -X -q -t -A -d "$DB" >>"$3" 2>&1 <<SQL
set role anon;
select 'OK:' || booking_code from public.create_booking('$1', 'راكب متزامن رقم $4', $2,
  (select id from public.pickup_points where name = 'الشروق'), '010$(printf '%08d' "$4")');
SQL
}

# ---- السيناريو 1: 150 عميل متزامن يطلبون 1-3 مقاعد على رحلة فارغة سعتها 50 ----
TRIP=$(setup_trip 0)
LOG=$(mktemp)
for i in $(seq 1 150); do book "$TRIP" $(( (i % 3) + 1 )) "$LOG" "$i" & done
wait
BOOKED=$(Q "select booked_seats from public.trips where id = '$TRIP'")
SUM=$(Q "select coalesce(sum(seats),0) from public.bookings where trip_id = '$TRIP' and status = 'confirmed'")
OKS=$(grep -c '^OK:' "$LOG" || true)
REJ=$(grep -c -E 'NOT_ENOUGH_SEATS|BUS_FULL' "$LOG" || true)
OTHER=$(( 150 - OKS - REJ ))
echo "تزامن (1): نجح $OKS حجز، رُفض $REJ لعدم توفر مقاعد، أخطاء أخرى $OTHER — المقاعد المحجوزة $BOOKED (المجموع الفعلي $SUM)"
[ "$BOOKED" -le 50 ] && [ "$BOOKED" = "$SUM" ] && [ "$OTHER" = 0 ] && [ "$BOOKED" -ge 48 ] \
  || { echo "FAIL: concurrency scenario 1"; cat "$LOG" | grep -v '^OK:' | sort | uniq -c | head; exit 1; }
echo "PASS: 150 حجز متزامن لم يتجاوز 50 مقعدًا"

# ---- السيناريو 2: تبقى مقعد واحد و 40 عميلًا يطلبونه في نفس اللحظة ----
TRIP=$(setup_trip 49)
LOG=$(mktemp)
for i in $(seq 1 40); do book "$TRIP" 1 "$LOG" "$((1000 + i))" & done
wait
OKS=$(grep -c '^OK:' "$LOG" || true)
BOOKED=$(Q "select booked_seats from public.trips where id = '$TRIP'")
STATUS=$(Q "select status from public.trips where id = '$TRIP'")
echo "تزامن (2): نجح $OKS من 40 — المقاعد المحجوزة $BOOKED — الحالة $STATUS"
[ "$OKS" = 1 ] && [ "$BOOKED" = 50 ] && [ "$STATUS" = full ] || { echo "FAIL: concurrency scenario 2"; exit 1; }
echo "PASS: آخر مقعد ذهب لعميل واحد فقط من 40 متزامنين"

# ---- السيناريو 3: تبقى مقعد واحد و 30 عميلًا يطلبون مقعدين ----
TRIP=$(setup_trip 49)
LOG=$(mktemp)
for i in $(seq 1 30); do book "$TRIP" 2 "$LOG" "$((2000 + i))" & done
wait
OKS=$(grep -c '^OK:' "$LOG" || true)
[ "$OKS" = 0 ] && [ "$(Q "select booked_seats from public.trips where id = '$TRIP'")" = 49 ] || { echo "FAIL: concurrency scenario 3"; exit 1; }
echo "PASS: مقعد واحد متبقٍ — رُفضت كل طلبات المقعدين المتزامنة (30)"

# ---- السيناريو 4: نفس رقم الهاتف من 20 جهازًا في نفس اللحظة → حجز واحد فقط ----
TRIP=$(setup_trip 0)
LOG=$(mktemp)
for i in $(seq 1 20); do
  psql -X -q -t -A -d "$DB" >>"$LOG" 2>&1 <<SQL &
set role anon;
select 'OK:' || booking_code from public.create_booking('$TRIP', 'مكرر رقم $i', 1,
  (select id from public.pickup_points where name = 'الشروق'), '01077777777');
SQL
done
wait
OKS=$(grep -c '^OK:' "$LOG" || true)
[ "$OKS" = 1 ] || { echo "FAIL: concurrency scenario 4 ($OKS)"; exit 1; }
echo "PASS: نفس رقم الهاتف من 20 جهازًا متزامنين — قُبل حجز واحد فقط"
echo "===== ALL CONCURRENCY TESTS PASSED ====="
