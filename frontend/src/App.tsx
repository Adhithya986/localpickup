import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Shops from "./pages/Shops";
import ShopDetails from "./pages/ShopDetails";
import Print from "./pages/Print";
import Pickup from "./pages/Pickup";
import BookingSuccess from "./pages/BookingSuccess";
import Bookings from "./pages/Bookings";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Admin from "./pages/Admin";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/shops" element={<Shops />} />
        <Route path="/shops/:id" element={<ShopDetails />} />
        <Route path="/print" element={<Print />} />
        <Route path="/pickup" element={<Pickup />} />
        <Route path="/booking-success" element={<BookingSuccess />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;