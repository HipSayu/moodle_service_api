import moodleService from './src/services/moodleService.js';

/**
 * Test hoàn chỉnh: Tạo quiz → Lấy quiz ID → Thêm câu hỏi
 */

async function testCompleteWorkflow() {
  const courseId = 12902; // Thay bằng course ID của bạn
  const sectionNumber = 3; // Section number (không phải section ID)

  console.log('='.repeat(80));
  console.log('TEST: Complete Workflow - Create Quiz and Add Questions');
  console.log('='.repeat(80));

  try {
    // BƯỚC 1: Tạo quiz mới
    console.log('\n📝 [Step 1] Creating quiz...');
    const quiz = await moodleService.createQuizWithPlugin(courseId, {
      name: 'Quiz Test - ' + new Date().toLocaleString('vi-VN'),
      intro: '<p>Bài kiểm tra được tạo tự động lúc ' + new Date().toLocaleString('vi-VN') + '</p>',
      section: sectionNumber,
      timeopen: Math.floor(Date.now() / 1000),
      timeclose: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 ngày
      timelimit: 1800, // 30 phút
      attempts: 2,
      grademethod: 1,
      grade: 10,
      visible: 1
    });

    console.log('✅ Quiz created successfully!');
    console.log('   Quiz ID:', quiz.quizId);
    console.log('   Quiz Name:', quiz.name);
    console.log('   Course ID:', quiz.courseId);

    // LƯU Ý: Đây là quiz ID để sử dụng
    const quizId = quiz.quizId;
    console.log('\n📌 QUIZ ID TO USE:', quizId);

    // BƯỚC 2: Thêm câu hỏi vào quiz
    console.log('\n📚 [Step 2] Adding questions to quiz...');
    
    const questions = [
      {
        questiontype: 'multichoice',
        name: 'Câu 1: Python là gì?',
        questiontext: '<p><strong>Python là ngôn ngữ lập trình thuộc loại nào?</strong></p>',
        defaultmark: 1.0,
        answers: [
          { text: 'Ngôn ngữ bậc cao', correct: true, feedback: 'Chính xác! Python là ngôn ngữ bậc cao.' },
          { text: 'Ngôn ngữ bậc thấp', correct: false, feedback: 'Sai rồi, Python là bậc cao.' },
          { text: 'Ngôn ngữ máy', correct: false, feedback: 'Không đúng.' },
          { text: 'Assembly', correct: false, feedback: 'Sai.' }
        ],
        page: 1
      },
      {
        questiontype: 'truefalse',
        name: 'Câu 2: Python là ngôn ngữ thông dịch',
        questiontext: '<p>Python là ngôn ngữ lập trình thông dịch (interpreted language)</p>',
        defaultmark: 1.0,
        answers: [],
        page: 1
      },
      {
        questiontype: 'shortanswer',
        name: 'Câu 3: Từ khóa khai báo hàm',
        questiontext: '<p>Trong Python, từ khóa nào được dùng để khai báo hàm?</p>',
        defaultmark: 1.0,
        answers: [
          { text: 'def', fraction: 1.0, feedback: 'Chính xác!' },
          { text: 'function', fraction: 0.0, feedback: 'Sai, đó là JavaScript' }
        ],
        page: 2
      }
    ];

    let questionCount = 0;
    for (const questionData of questions) {
      const result = await moodleService.createAndAddQuestionToQuiz(quizId, questionData);
      questionCount++;
      console.log(`✅ Question ${questionCount} added: ${result.name}`);
      
      // Delay nhỏ giữa các request
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // BƯỚC 3: Tổng kết
    console.log('\n' + '='.repeat(80));
    console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   Course ID: ${courseId}`);
    console.log(`   Section: ${sectionNumber}`);
    console.log(`   Quiz ID: ${quizId} ⭐`);
    console.log(`   Quiz Name: ${quiz.name}`);
    console.log(`   Questions Added: ${questionCount}`);
    console.log('\n💡 Next time, use this quiz ID:', quizId);

  } catch (error) {
    console.error('\n❌ WORKFLOW FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('\nMoodle Error Details:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Chạy test
testCompleteWorkflow()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
