import psycopg2

try:
    conn = psycopg2.connect(
        host="aws-0-eu-west-1.pooler.supabase.com",
        port=6543,
        database="postgres",
        user="postgres.tlgqgkfhflzevfsovjsh",
        password="M1k3%%$$360"
    )
    print("SUCCESS - Connected to Supabase!")
    conn.close()
except Exception as e:
    print(f"FAILED - {e}")
    