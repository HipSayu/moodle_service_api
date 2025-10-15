import moodleService from './src/services/moodleService.js';
import { logger } from './src/utils/logger.js';

/**
 * Script test tạo câu hỏi và thêm vào quiz
 */

async function testCreateQuestions() {
  const quizId = 67; // Thay bằng quiz ID của bạn (quiz vừa tạo)
  
  console.log('='.repeat(80));
  console.log('TEST: Tạo câu hỏi và thêm vào Quiz');
  console.log('='.repeat(80));

  try {
    // Test 1: Tạo câu hỏi trắc nghiệm (Multiple Choice)
    console.log('\n📝 [Test 1] Tạo câu hỏi trắc nghiệm...');
    const mcQuestion = await moodleService.createAndAddQuestionToQuiz(quizId, {
      questiontype: 'multichoice',
      name: 'Câu 1: Python là gì?',
      questiontext: '<p>Python là ngôn ngữ lập trình thuộc loại nào?</p>',
      defaultmark: 1.0,
      answers: [
        { text: 'Ngôn ngữ bậc cao', correct: true, feedback: 'Chính xác!' },
        { text: 'Ngôn ngữ bậc thấp', correct: false, feedback: 'Sai rồi' },
        { text: 'Ngôn ngữ máy', correct: false, feedback: 'Không đúng' },
        { text: 'Assembly', correct: false, feedback: 'Sai' }
      ],
      page: 1
    });
    console.log('✅ Multiple choice question created:', mcQuestion);

    // Test 2: Tạo câu hỏi Đúng/Sai (True/False)
    console.log('\n📝 [Test 2] Tạo câu hỏi Đúng/Sai...');
    const tfQuestion = await moodleService.createAndAddQuestionToQuiz(quizId, {
      questiontype: 'truefalse',
      name: 'Câu 2: Python là ngôn ngữ thông dịch',
      questiontext: '<p>Python là ngôn ngữ lập trình thông dịch (interpreted)</p>',
      defaultmark: 1.0,
      answers: [], // True/False không cần answers array
      page: 1
    });
    console.log('✅ True/False question created:', tfQuestion);

    // Test 3: Tạo câu hỏi điền từ (Short Answer)
    console.log('\n📝 [Test 3] Tạo câu hỏi điền từ...');
    const saQuestion = await moodleService.createAndAddQuestionToQuiz(quizId, {
      questiontype: 'shortanswer',
      name: 'Câu 3: Từ khóa khai báo hàm',
      questiontext: '<p>Trong Python, từ khóa nào được dùng để khai báo hàm?</p>',
      defaultmark: 1.0,
      answers: [
        { text: 'def', fraction: 1.0, feedback: 'Đúng!' },
        { text: 'function', fraction: 0.0, feedback: 'Sai' }
      ],
      page: 2
    });
    console.log('✅ Short answer question created:', saQuestion);

    // Test 4: Tạo thêm nhiều câu hỏi
    console.log('\n📚 [Test 4] Tạo nhiều câu hỏi...');
    const questions = [
      {
        questiontype: 'multichoice',
        name: 'Câu 4: Kiểu dữ liệu',
        questiontext: '<p>Kiểu dữ liệu nào dùng để lưu số thực trong Python?</p>',
        defaultmark: 1.0,
        answers: [
          { text: 'int', correct: false },
          { text: 'float', correct: true },
          { text: 'str', correct: false },
          { text: 'bool', correct: false }
        ],
        page: 2
      },
      {
        questiontype: 'multichoice',
        name: 'Câu 5: Cấu trúc điều kiện',
        questiontext: '<p>Cấu trúc nào dùng để kiểm tra điều kiện trong Python?</p>',
        defaultmark: 1.0,
        answers: [
          { text: 'if-else', correct: true },
          { text: 'switch-case', correct: false },
          { text: 'select-when', correct: false },
          { text: 'check-test', correct: false }
        ],
        page: 3
      }
    ];

    const createdQuestions = [];
    for (const questionData of questions) {
      const result = await moodleService.createAndAddQuestionToQuiz(quizId, questionData);
      createdQuestions.push(result);
      console.log(`✅ Created: ${result.name}`);
      
      // Delay nhỏ giữa các request
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   - Quiz ID: ${quizId}`);
    console.log(`   - Total questions created: ${createdQuestions.length + 3}`);
    console.log(`   - Multiple choice: ${createdQuestions.length + 2}`);
    console.log(`   - True/False: 1`);
    console.log(`   - Short answer: 1`);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Chạy test
testCreateQuestions()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
