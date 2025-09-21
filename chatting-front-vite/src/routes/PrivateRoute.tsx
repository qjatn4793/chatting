import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PrivateRoute() {
  const { isAuthed, token } = useAuth();
  const location = useLocation();
  const hasToken = isAuthed || Boolean(token) || Boolean(localStorage.getItem('jwt'));
  return hasToken ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}
