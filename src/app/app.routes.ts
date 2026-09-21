import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { About } from './components/about/about';
import { Project } from './components/project/project';
import { Testimonials } from './components/testimonials/testimonials';
import { Contact } from './components/contact/contact';
import { AdminTestimonials } from './components/admin-testimonials/admin-testimonials';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'about', component: About },
  { path: 'projects', component: Project },
  { path: 'testimonials', component: Testimonials },
  { path: 'contact', component: Contact },
  { path: 'admin/testimonials', component: AdminTestimonials },
];
