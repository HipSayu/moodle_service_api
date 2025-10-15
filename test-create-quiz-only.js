import moodleService from './src/services/moodleService.js';

/**
 * Test tạo quiz và section - Version đơn giản
 * (Không tạo câu hỏi vì cần fix plugin cho Moodle 4.3+)
 */

async function testQuizCreation() {
  const courseId = 12902; // Thay bằng course ID của bạn
  
  console.log('='.repeat(80));
  console.log('TEST: Create Complete Course Structure');
  console.log('='.repeat(80));

  try {
    // BƯỚC 1: Tạo section
    console.log('\n📖 [Step 1] Creating section...');
    const section = await moodleService.createSectionWithPlugin(courseId, {
      name: 'Tuần ' + Math.ceil(Date.now() / 1000 / 86400 / 7) % 52,
      summary: '<p>Nội dung học tuần này</p>',
      visible: 1
    });

    console.log('✅ Section created!');
    console.log('   Section ID:', section.sectionid);
    console.log('   Section Number:', section.section);
    console.log('   Name:', section.name);

    // BƯỚC 2: Tạo quiz trong section
    console.log('\n📝 [Step 2] Creating quiz in section...');
    const quiz = await moodleService.createQuizWithPlugin(courseId, {
      name: 'Quiz - ' + new Date().toLocaleDateString('vi-VN'),
      intro: '<p>Bài kiểm tra tuần này</p>',
      section: section.section,
      timeopen: Math.floor(Date.now() / 1000),
      timeclose: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      timelimit: 1800,
      attempts: 2,
      grademethod: 1,
      grade: 10,
      visible: 1
    });

    console.log('✅ Quiz created!');
    console.log('   Quiz ID:', quiz.quizId, '⭐');
    console.log('   Quiz Name:', quiz.name);

    // BƯỚC 3: Hướng dẫn tiếp theo
    console.log('\n' + '='.repeat(80));
    console.log('✅ COURSE STRUCTURE CREATED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   Course ID: ${courseId}`);
    console.log(`   Section: ${section.section} - "${section.name}"`);
    console.log(`   Quiz ID: ${quiz.quizId} - "${quiz.name}"`);
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Open Moodle in browser');
    console.log('   2. Navigate to the quiz');
    console.log('   3. Click "Edit quiz"');
    console.log('   4. Add questions manually');
    console.log('   OR');
    console.log('   5. Import questions from XML file');
    
    console.log('\n📝 Quiz URL:');
    console.log(`   http://your-moodle-url/mod/quiz/view.php?id=${quiz.quizId}`);

    // Lưu thông tin vào file
    const fs = await import('fs');
    const quizInfo = {
      created: new Date().toISOString(),
      courseId: courseId,
      sectionId: section.sectionid,
      sectionNumber: section.section,
      sectionName: section.name,
      quizId: quiz.quizId,
      quizName: quiz.name
    };
    
    fs.writeFileSync(
      'lastSync.json',
      JSON.stringify(quizInfo, null, 2)
    );
    console.log('\n💾 Quiz info saved to: lastSync.json');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('\nMoodle Error Details:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Chạy test
testQuizCreation()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
