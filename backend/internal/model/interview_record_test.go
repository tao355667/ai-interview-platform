package model

import (
	"fmt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"testing"
	"time"
)

func TestInterviewRecordPagination(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	defer sqlDB.Close()
	old := getDB
	SetDBGetter(func() *gorm.DB { return db })
	defer SetDBGetter(old)
	if err := db.AutoMigrate(&InterviewRecord{}); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasIndex(&InterviewRecord{}, "idx_interview_user_created") {
		t.Fatal("composite index missing")
	}
	at := time.Now()
	for i := 1; i <= 105; i++ {
		if err := db.Create(&InterviewRecord{UserID: 1, Type: "special", Domain: "Go", Difficulty: "medium", CreatedAt: at}).Error; err != nil {
			t.Fatal(err)
		}
	}
	db.Create(&InterviewRecord{UserID: 2, Type: "special", Domain: "Go", Difficulty: "medium", CreatedAt: at})
	for page := int32(1); page <= 2; page++ {
		size := int32(10)
		rows, total, err := InterviewRecordDao.ListInterviewRecords(1, &page, &size)
		if err != nil || total != 105 || len(rows) != 10 {
			t.Fatalf("page result: %d %d %v", len(rows), total, err)
		}
		for i, row := range rows {
			want := uint64(105 - int(page-1)*10 - i)
			if row.ID != want || row.UserID != 1 {
				t.Fatal(fmt.Sprintf("unstable ordering/user isolation: got %d want %d", row.ID, want))
			}
		}
	}
	page, size := int32(1), int32(2147483647)
	rows, _, err := InterviewRecordDao.ListInterviewRecords(1, &page, &size)
	if err != nil || len(rows) != 100 {
		t.Fatalf("page size not bounded: %d %v", len(rows), err)
	}
	page = 2147483647
	rows, _, err = InterviewRecordDao.ListInterviewRecords(1, &page, &size)
	if err != nil || len(rows) != 0 {
		t.Fatalf("offset overflow: %d %v", len(rows), err)
	}
	rows, _, err = InterviewRecordDao.ListInterviewRecords(1, nil, nil)
	if err != nil || len(rows) != 10 {
		t.Fatal("default pagination failed")
	}
}
