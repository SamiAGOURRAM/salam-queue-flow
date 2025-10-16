import Navbar from "@/components/Navbar";
import ClinicDirectory from "@/components/booking/ClinicDirectory";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-16">
        <ClinicDirectory />
      </div>
    </div>
  );
};

export default Index;
