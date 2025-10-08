# Database Schema cho Hệ thống Đồng bộ Moodle - SQL Server

## Tổng quan
Hệ thống này giả định bạn có một cơ sở dữ liệu SQL Server chứa thông tin về sinh viên, giảng viên, khóa học và điểm số. Dưới đây là schema cơ bản được sử dụng trong hệ thống.

## Tables

### 1. Students - Thông tin sinh viên

```sql
CREATE TABLE Students (
    student_id INT IDENTITY(1,1) PRIMARY KEY,
    student_code NVARCHAR(20) UNIQUE NOT NULL,
    first_name NVARCHAR(50) NOT NULL,
    last_name NVARCHAR(50) NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    phone NVARCHAR(20),
    date_of_birth DATE,
    gender NVARCHAR(10),
    address NVARCHAR(255),
    enrollment_date DATE NOT NULL,
    status NVARCHAR(20) DEFAULT 'active',
    department_id INT,
    class_id INT,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
```

### 2. Teachers - Thông tin giảng viên

```sql
CREATE TABLE Teachers (
    teacher_id INT IDENTITY(1,1) PRIMARY KEY,
    teacher_code NVARCHAR(20) UNIQUE NOT NULL,
    first_name NVARCHAR(50) NOT NULL,
    last_name NVARCHAR(50) NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    phone NVARCHAR(20),
    title NVARCHAR(50),
    department_id INT,
    hire_date DATE NOT NULL,
    status NVARCHAR(20) DEFAULT 'active',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
```

### 3. Courses - Thông tin khóa học

```sql
CREATE TABLE Courses (
    course_id INT IDENTITY(1,1) PRIMARY KEY,
    course_code NVARCHAR(20) UNIQUE NOT NULL,
    course_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    credits INT,
    department_id INT,
    semester NVARCHAR(20),
    academic_year NVARCHAR(10),
    teacher_id INT,
    status NVARCHAR(20) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (teacher_id) REFERENCES Teachers(teacher_id)
);
```

### 4. Course_Enrollments - Đăng ký khóa học

```sql
CREATE TABLE Course_Enrollments (
    enrollment_id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrollment_date DATE NOT NULL,
    status NVARCHAR(20) DEFAULT 'enrolled',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (student_id) REFERENCES Students(student_id),
    FOREIGN KEY (course_id) REFERENCES Courses(course_id),
    UNIQUE(student_id, course_id)
);
```

### 5. Grades - Điểm số

```sql
CREATE TABLE Grades (
    grade_id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    assignment_name NVARCHAR(255) NOT NULL,
    grade DECIMAL(5,2),
    max_grade DECIMAL(5,2),
    grade_date DATETIME2,
    moodle_grade_id INT,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (student_id) REFERENCES Students(student_id),
    FOREIGN KEY (course_id) REFERENCES Courses(course_id)
);
```

### 6. Departments - Khoa/Phòng ban (Optional)

```sql
CREATE TABLE Departments (
    department_id INT IDENTITY(1,1) PRIMARY KEY,
    department_code NVARCHAR(20) UNIQUE NOT NULL,
    department_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    head_teacher_id INT,
    status NVARCHAR(20) DEFAULT 'active',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
```

### 7. Classes - Lớp học (Optional)

```sql
CREATE TABLE Classes (
    class_id INT IDENTITY(1,1) PRIMARY KEY,
    class_code NVARCHAR(20) UNIQUE NOT NULL,
    class_name NVARCHAR(255) NOT NULL,
    academic_year NVARCHAR(10),
    department_id INT,
    advisor_teacher_id INT,
    status NVARCHAR(20) DEFAULT 'active',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (department_id) REFERENCES Departments(department_id),
    FOREIGN KEY (advisor_teacher_id) REFERENCES Teachers(teacher_id)
);
```

## Indexes để tối ưu performance

```sql
-- Indexes cho Students
CREATE INDEX IX_Students_StudentCode ON Students(student_code);
CREATE INDEX IX_Students_Email ON Students(email);
CREATE INDEX IX_Students_Status ON Students(status);
CREATE INDEX IX_Students_UpdatedAt ON Students(updated_at);

-- Indexes cho Teachers
CREATE INDEX IX_Teachers_TeacherCode ON Teachers(teacher_code);
CREATE INDEX IX_Teachers_Email ON Teachers(email);
CREATE INDEX IX_Teachers_Status ON Teachers(status);
CREATE INDEX IX_Teachers_UpdatedAt ON Teachers(updated_at);

-- Indexes cho Courses
CREATE INDEX IX_Courses_CourseCode ON Courses(course_code);
CREATE INDEX IX_Courses_TeacherId ON Courses(teacher_id);
CREATE INDEX IX_Courses_Status ON Courses(status);
CREATE INDEX IX_Courses_UpdatedAt ON Courses(updated_at);

-- Indexes cho Enrollments
CREATE INDEX IX_Enrollments_StudentId ON Course_Enrollments(student_id);
CREATE INDEX IX_Enrollments_CourseId ON Course_Enrollments(course_id);
CREATE INDEX IX_Enrollments_Status ON Course_Enrollments(status);

-- Indexes cho Grades
CREATE INDEX IX_Grades_StudentId ON Grades(student_id);
CREATE INDEX IX_Grades_CourseId ON Grades(course_id);
CREATE INDEX IX_Grades_MoodleGradeId ON Grades(moodle_grade_id);
CREATE INDEX IX_Grades_GradeDate ON Grades(grade_date);
```

## Triggers để tự động cập nhật updated_at

```sql
-- Trigger cho Students
CREATE TRIGGER TR_Students_UpdatedAt ON Students
AFTER UPDATE
AS
BEGIN
    UPDATE Students 
    SET updated_at = GETDATE() 
    WHERE student_id IN (SELECT student_id FROM inserted);
END;

-- Trigger cho Teachers
CREATE TRIGGER TR_Teachers_UpdatedAt ON Teachers
AFTER UPDATE
AS
BEGIN
    UPDATE Teachers 
    SET updated_at = GETDATE() 
    WHERE teacher_id IN (SELECT teacher_id FROM inserted);
END;

-- Trigger cho Courses
CREATE TRIGGER TR_Courses_UpdatedAt ON Courses
AFTER UPDATE
AS
BEGIN
    UPDATE Courses 
    SET updated_at = GETDATE() 
    WHERE course_id IN (SELECT course_id FROM inserted);
END;
```

## Sample Data

```sql
-- Sample Departments
INSERT INTO Departments (department_code, department_name) VALUES 
('IT', N'Công nghệ thông tin'),
('BUS', N'Kinh doanh'),
('ENG', N'Kỹ thuật');

-- Sample Classes
INSERT INTO Classes (class_code, class_name, academic_year, department_id) VALUES 
('IT2021A', N'Công nghệ thông tin 2021A', '2021-2025', 1),
('BUS2021A', N'Kinh doanh 2021A', '2021-2025', 2);

-- Sample Teachers
INSERT INTO Teachers (teacher_code, first_name, last_name, email, title, department_id, hire_date) VALUES 
('GV001', N'Nguyễn', N'Văn A', 'nguyen.vana@university.edu.vn', N'Tiến sĩ', 1, '2015-01-01'),
('GV002', N'Trần', N'Thị B', 'tran.thib@university.edu.vn', N'Thạc sĩ', 2, '2016-01-01');

-- Sample Students
INSERT INTO Students (student_code, first_name, last_name, email, department_id, class_id, enrollment_date) VALUES 
('SV001', N'Lê', N'Văn C', 'le.vanc@student.university.edu.vn', 1, 1, '2021-09-01'),
('SV002', N'Phạm', N'Thị D', 'pham.thid@student.university.edu.vn', 1, 1, '2021-09-01'),
('SV003', N'Hoàng', N'Văn E', 'hoang.vane@student.university.edu.vn', 2, 2, '2021-09-01');

-- Sample Courses
INSERT INTO Courses (course_code, course_name, description, credits, department_id, teacher_id, semester, academic_year, start_date, end_date) VALUES 
('IT101', N'Lập trình căn bản', N'Khóa học lập trình cơ bản', 3, 1, 1, 'HK1', '2021-2022', '2021-09-01', '2021-12-31'),
('IT102', N'Cơ sở dữ liệu', N'Khóa học về cơ sở dữ liệu', 3, 1, 1, 'HK2', '2021-2022', '2022-01-01', '2022-05-31'),
('BUS101', N'Quản trị học', N'Khóa học quản trị cơ bản', 3, 2, 2, 'HK1', '2021-2022', '2021-09-01', '2021-12-31');

-- Sample Enrollments
INSERT INTO Course_Enrollments (student_id, course_id, enrollment_date) VALUES 
(1, 1, '2021-09-01'),
(1, 2, '2022-01-01'),
(2, 1, '2021-09-01'),
(2, 2, '2022-01-01'),
(3, 3, '2021-09-01');
```

## Lưu ý

1. **Collation**: Đảm bảo database sử dụng collation hỗ trợ tiếng Việt (ví dụ: `SQL_Latin1_General_CP1_CI_AS`)

2. **Permissions**: User kết nối cần có quyền:
   - SELECT trên các bảng Students, Teachers, Courses, Course_Enrollments
   - INSERT, UPDATE trên bảng Grades

3. **Data Types**: 
   - NVARCHAR cho các trường có thể chứa tiếng Việt
   - DATETIME2 thay vì DATETIME để có độ chính xác cao hơn
   - DECIMAL(5,2) cho điểm số (cho phép điểm từ 0.00 đến 999.99)

4. **Constraints**: Thêm các ràng buộc phù hợp với business logic của bạn (ví dụ: CHECK constraints cho điểm số, status values, etc.)

5. **Backup**: Đảm bảo có backup strategy cho dữ liệu trước khi chạy sync