import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom'; // BrowserRouter 임포트
import ChatApp from './ChatApp'; // ChatApp 컴포넌트

const App = () => {
  return (
    <Router> {/* ChatApp을 BrowserRouter로 감싸기 */}
      <ChatApp />
    </Router>
  );
};

export default App;
