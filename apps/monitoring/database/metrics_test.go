package database

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func testMetricsDB(t *testing.T) *DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skip("SQLite integration tests require CGO_ENABLED=1")
		}
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &DB{DB: db}
}

func TestGetMetricsInRangeLimitReturnsLatestSamplesInAscendingOrder(t *testing.T) {
	db := testMetricsDB(t)
	_, err := db.Exec(`CREATE TABLE server_metrics (
		timestamp TEXT PRIMARY KEY,
		cpu REAL,
		cpu_model TEXT,
		cpu_cores INTEGER,
		cpu_physical_cores INTEGER,
		cpu_speed REAL,
		os TEXT,
		distro TEXT,
		kernel TEXT,
		arch TEXT,
		mem_used REAL,
		mem_used_gb REAL,
		mem_total REAL,
		uptime INTEGER,
		disk_used REAL,
		total_disk REAL,
		network_in REAL,
		network_out REAL
	)`)
	if err != nil {
		t.Fatal(err)
	}

	start := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		stamp := start.Add(time.Duration(index) * time.Minute)
		if err := db.SaveMetric(ServerMetric{
			Timestamp: stamp.Format(time.RFC3339Nano),
			CPU:       float64(index),
		}); err != nil {
			t.Fatal(err)
		}
	}

	metrics, err := db.GetMetricsInRangeLimit(start, start.Add(5*time.Minute), 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(metrics) != 2 {
		t.Fatalf("expected 2 metrics, got %d", len(metrics))
	}
	if metrics[0].CPU != 1 || metrics[1].CPU != 2 {
		t.Fatalf("expected latest metrics in ascending order, got %#v", metrics)
	}
}

func TestGetContainerMetricsInRangeSupportsAllContainers(t *testing.T) {
	db := testMetricsDB(t)
	_, err := db.Exec(`CREATE TABLE container_metrics (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TEXT NOT NULL,
		container_id TEXT NOT NULL,
		container_name TEXT NOT NULL,
		metrics_json TEXT NOT NULL
	)`)
	if err != nil {
		t.Fatal(err)
	}

	start := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		stamp := start.Add(time.Duration(index) * time.Minute).Format(time.RFC3339Nano)
		payload, marshalErr := json.Marshal(ContainerMetric{
			Timestamp: stamp,
			CPU:       float64(index),
			ID:        "container",
			Name:      "app-1",
		})
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if _, insertErr := db.Exec(
			`INSERT INTO container_metrics (timestamp, container_id, container_name, metrics_json) VALUES (?, ?, ?, ?)`,
			stamp,
			"container",
			"app-1",
			string(payload),
		); insertErr != nil {
			t.Fatal(insertErr)
		}
	}

	metrics, err := db.GetContainerMetricsInRange(
		"",
		start,
		start.Add(5*time.Minute),
		2,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(metrics) != 2 {
		t.Fatalf("expected 2 metrics, got %d", len(metrics))
	}
	if metrics[0].CPU != 1 || metrics[1].CPU != 2 {
		t.Fatalf("expected latest container metrics in ascending order, got %#v", metrics)
	}
}
